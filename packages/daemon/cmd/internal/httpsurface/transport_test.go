package httpsurface

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
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
}

// sourceFailure wraps an rrd error the way loading an analysis' sources does, so the table checks
// the chain a request actually fails with.
func sourceFailure(err error) error {
	return fmt.Errorf("load sources of %q: %w", "cpu", fmt.Errorf("read source %q: %w", "cpu.rrd", err))
}

func TestStatusOfNamesWhatEachDomainErrorMeansInHTTP(t *testing.T) {
	for _, tt := range domainErrorStatuses {
		t.Run(tt.name, func(t *testing.T) {
			if got := statusOf(tt.give); got != tt.want {
				t.Errorf("statusOf(%v) = %d, want %d", tt.give, got, tt.want)
			}
		})
	}
}

func TestStatusOfAnswersAnErrorNoDomainNamesAsTheServersFault(t *testing.T) {
	if got := statusOf(errors.New("disk on fire")); got != http.StatusInternalServerError {
		t.Errorf("statusOf(an unnamed error) = %d, want %d", got, http.StatusInternalServerError)
	}
}

// TestEveryDomainErrorHasAStatusCase reads the error every domain declares out of its source, so a
// new one fails here until domainErrorStatuses, and with it statusOf, decides what it means.
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
