package httpsurface

import (
	"context"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"math"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	searchesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"
	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// statusCase is one domain error, wrapped the way the use case that raises it wraps it, and the
// status it must be answered with.
type statusCase struct {
	name string
	give error
	want int
}

// domainErrorStatuses is what every domain error means in HTTP. TestEveryDomainErrorHasAStatusCase
// keeps it complete.
var domainErrorStatuses = []statusCase{
	{name: "unknown analysis", give: fmt.Errorf("read analysis: %w", analysisDomain.ErrAnalysisNotFound), want: http.StatusNotFound},
	{name: "unknown series", give: analysisDomain.ErrSeriesNotFound, want: http.StatusNotFound},
	{name: "no sources", give: analysisDomain.ErrNoSources, want: http.StatusBadRequest},
	{name: "blank name", give: analysisDomain.ErrNameEmpty, want: http.StatusBadRequest},
	{name: "full chart", give: analysisDomain.ErrChartFull, want: http.StatusBadRequest},
	{name: "unknown value axis", give: analysisDomain.ErrAxisUnknown, want: http.StatusBadRequest},
	{name: "unknown reference line statistic", give: analysisDomain.ErrStatisticUnknown, want: http.StatusBadRequest},
	{name: "series color not written #rrggbb", give: fmt.Errorf("%q: %w", "teal", analysisDomain.ErrColorInvalid), want: http.StatusBadRequest},
	{name: "nothing to export", give: exportDomain.ErrNothingToExport, want: http.StatusBadRequest},
	{name: "source without a path", give: analysisDomain.ErrSourceUnlocated, want: http.StatusUnprocessableEntity},
	{name: "copied source without a path", give: fmt.Errorf("%q: %w", "picked.rrd", exportDomain.ErrSourceUnlocated), want: http.StatusUnprocessableEntity},
	{name: "copied source no longer on disk", give: fmt.Errorf("read source %q: %w: %w", "/data/cpu.rrd", exportDomain.ErrSourceUnreadable, fs.ErrNotExist), want: http.StatusUnprocessableEntity},
	{name: "copied file that is not a source", give: fmt.Errorf("%q: %w", "id_rsa", exportDomain.ErrNotASource), want: http.StatusUnprocessableEntity},
	{name: "source that cannot be read", give: sourceFailure(fmt.Errorf("%q: %w: %w", "/data/cpu.rrd", rrdDomain.ErrUnreadableSource, fs.ErrNotExist)), want: http.StatusUnprocessableEntity},
	{name: "source that is not an rrd", give: sourceFailure(fmt.Errorf("%q: %w", "/data/notes.txt", rrdDomain.ErrNotAnRRDDump)), want: http.StatusUnprocessableEntity},
	{name: "source without rows", give: sourceFailure(fmt.Errorf("%q: %w", "/data/empty.rrd", rrdDomain.ErrEmptyArchive)), want: http.StatusUnprocessableEntity},
	{name: "source in a layout this build cannot read", give: sourceFailure(fmt.Errorf("read rrd database %q: %w", "/data/cpu.rrd", rrdDomain.ErrUnreadableLayout)), want: http.StatusUnprocessableEntity},
	{name: "source that needs a missing rrdtool", give: sourceFailure(fmt.Errorf("%q: %w", "/data/cpu.rrd", rrdDomain.ErrDumpToolMissing)), want: http.StatusInternalServerError},
	{name: "insights run without an analysis", give: insightsDomain.ErrAnalysisRequired, want: http.StatusBadRequest},
	{name: "insights run over an unknown scope", give: fmt.Errorf("scope %q: %w", "everything", insightsDomain.ErrUnknownScope), want: http.StatusBadRequest},
	{name: "insights viewport without a window", give: fmt.Errorf("window 5 to 5: %w", insightsDomain.ErrViewportWindowRequired), want: http.StatusBadRequest},
	{name: "search history under a blank field", give: searchesDomain.ErrFieldInvalid, want: http.StatusBadRequest},
	{name: "blank search term", give: searchesDomain.ErrTermEmpty, want: http.StatusBadRequest},
	{name: "search term too long", give: fmt.Errorf("remember: %w", searchesDomain.ErrTermTooLong), want: http.StatusBadRequest},
	{name: "insights run over an unknown series", give: fmt.Errorf("series %q: %w", "ghost", insightsDomain.ErrUnknownSeries), want: http.StatusNotFound},
	{name: "insights defaults that do not parse", give: insightsDomain.DefaultConfigurationFailure(nil), want: http.StatusInternalServerError},
	{name: "a build given no share service", give: sharingDomain.ErrNotConfigured, want: http.StatusServiceUnavailable},
	{name: "following a session with nowhere to keep it", give: sharingDomain.ErrViewingUnavailable, want: http.StatusNotImplemented},
	{name: "an analysis not live", give: fmt.Errorf("find the live session of %q: %w", "a", sharingDomain.ErrNotLive), want: http.StatusNotFound},
	{name: "a session not followed", give: sharingDomain.ErrNotFollowed, want: http.StatusNotFound},
	{name: "a session that ended", give: errors.Join(sharingDomain.ErrSessionEnded, nil), want: http.StatusNotFound},
	{name: "a malformed link", give: sharingDomain.ErrLinkInvalid, want: http.StatusBadRequest},
	{name: "a link whose key does not open the session", give: sharingDomain.ErrKeyRefused, want: http.StatusUnprocessableEntity},
	{name: "a session past the service's size", give: fmt.Errorf("publish %q: %w", "cpu.rrd", sharingDomain.ErrTooLarge), want: http.StatusRequestEntityTooLarge},
	{name: "a service refusing new sessions", give: fmt.Errorf("start a live session: %w", sharingDomain.ErrServiceBusy), want: http.StatusTooManyRequests},
	{name: "a service that cannot be reached", give: fmt.Errorf("%w: POST /api/sessions: %w", sharingDomain.ErrServiceFailed, errors.New("refused")), want: http.StatusBadGateway},
	{name: "a new log without its content", give: sharingDomain.ErrLogContentMissing, want: http.StatusBadRequest},
	{name: "a log's view that is not JSON", give: sharingDomain.ErrLogViewInvalid, want: http.StatusBadRequest},
	{name: "a published source without a path", give: fmt.Errorf("%q: %w", "dropped.rrd", sharingDomain.ErrSourceUnlocated), want: http.StatusUnprocessableEntity},
	{name: "a published source that cannot be read", give: fmt.Errorf("%q: %w: %w", "cpu.rrd", sharingDomain.ErrSourceUnreadable, fs.ErrNotExist), want: http.StatusUnprocessableEntity},
	{name: "a published file that is not a source", give: fmt.Errorf("%q: %w", "id_rsa", sharingDomain.ErrNotASource), want: http.StatusUnprocessableEntity},
}

// sourceFailure wraps an rrd error the way loading an analysis' sources does, so the table checks
// the chain a request actually fails with.
func sourceFailure(err error) error {
	return fmt.Errorf("load sources of %q: %w", "cpu", fmt.Errorf("read source %q: %w", "cpu.rrd", err))
}

func TestStatusOfNamesWhatEachDomainErrorMeansInHTTP(t *testing.T) {
	for _, tt := range domainErrorStatuses {
		t.Run(tt.name, func(t *testing.T) {
			if got := StatusOf(tt.give); got != tt.want {
				t.Errorf("StatusOf(%v) = %d, want %d", tt.give, got, tt.want)
			}
		})
	}
}

func TestStatusOfAnswersAnErrorNoDomainNamesAsTheServersFault(t *testing.T) {
	if got := StatusOf(errors.New("disk on fire")); got != http.StatusInternalServerError {
		t.Errorf("StatusOf(an unnamed error) = %d, want %d", got, http.StatusInternalServerError)
	}
}

// TestEveryDomainErrorHasAStatusCase reads the error every domain declares out of its source, so a
// new one fails here until domainErrorStatuses, and with it StatusOf, decides what it means.
func TestEveryDomainErrorHasAStatusCase(t *testing.T) {
	for _, declared := range declaredDomainErrors(t) {
		covered := slices.ContainsFunc(domainErrorStatuses, func(status statusCase) bool {
			return errors.Is(status.give, declared)
		})

		if !covered {
			t.Errorf("no status case for %q", declared)
		}
	}
}

// declaredDomainErrors is every exported Err constant of every domain package, read from its
// source. A domain error declared any other way than as a failure.Error constant with a literal
// message fails the test, since its value cannot be known without running the package.
func declaredDomainErrors(t *testing.T) []failure.Error {
	t.Helper()

	paths, err := filepath.Glob(filepath.Join("..", "..", "..", "internal", "*", "domain", "*.go"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("find the domain packages: %v, %d files", err, len(paths))
	}

	var declared []failure.Error
	for _, path := range paths {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}

		for _, declaration := range file.Decls {
			general, isGeneral := declaration.(*ast.GenDecl)
			if !isGeneral || (general.Tok != token.CONST && general.Tok != token.VAR) {
				continue
			}

			for _, spec := range general.Specs {
				declared = append(declared, domainErrorsOf(t, path, general.Tok, spec)...)
			}
		}
	}

	return declared
}

func domainErrorsOf(t *testing.T, path string, keyword token.Token, spec ast.Spec) []failure.Error {
	t.Helper()

	values, isValue := spec.(*ast.ValueSpec)
	if !isValue {
		return nil
	}

	var declared []failure.Error
	for index, name := range values.Names {
		if !name.IsExported() || !strings.HasPrefix(name.Name, "Err") {
			continue
		}

		message, isLiteral := literalFailureMessage(keyword, values, index)
		if !isLiteral {
			t.Errorf("%s: declare %s as a failure.Error constant with a literal message", path, name.Name)

			continue
		}

		declared = append(declared, failure.Error(message))
	}

	return declared
}

func literalFailureMessage(keyword token.Token, values *ast.ValueSpec, index int) (string, bool) {
	declaredType, isSelector := values.Type.(*ast.SelectorExpr)
	if keyword != token.CONST || !isSelector || declaredType.Sel.Name != "Error" || index >= len(values.Values) {
		return "", false
	}

	if packageName, isIdentifier := declaredType.X.(*ast.Ident); !isIdentifier || packageName.Name != "failure" {
		return "", false
	}

	literal, isLiteral := values.Values[index].(*ast.BasicLit)
	if !isLiteral || literal.Kind != token.STRING {
		return "", false
	}

	message, err := strconv.Unquote(literal.Value)

	return message, err == nil
}

func TestDecodeRefusesABodyPastTheLimit(t *testing.T) {
	oversized := `{"name":"` + strings.Repeat("a", maximumBodyBytes) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/analyses", strings.NewReader(oversized))
	recorder := httptest.NewRecorder()

	var body createAnalysisBody
	if decode(recorder, request, &body) {
		t.Fatal("decoded a body past the limit")
	}

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}

func TestUnavailableDialogsRefuseEveryHalfOnlyANativeWindowHas(t *testing.T) {
	dialogs := UnavailableDialogs{}
	tests := []struct {
		name string
		give func() error
	}{
		{name: "pick sources", give: func() error {
			_, err := dialogs.PickSources(context.Background())

			return err
		}},
		{name: "pick a save target", give: func() error {
			_, err := dialogs.PickSaveTarget(context.Background(), "cpu.csv")

			return err
		}},
		{name: "write an export", give: func() error {
			return dialogs.Write(context.Background(), "/data/cpu.csv", []byte("timestamp"))
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.give(); err == nil {
				t.Error("err = nil, want the refusal a browser is answered with")
			}
		})
	}
}

func TestRespondAnswersAPayloadJSONCannotEncodeWithNoHalfWrittenBody(t *testing.T) {
	recorder := httptest.NewRecorder()

	respond(recorder, math.NaN(), nil)

	if recorder.Body.Len() != 0 {
		t.Errorf("body = %q, want nothing written", recorder.Body.String())
	}
}
