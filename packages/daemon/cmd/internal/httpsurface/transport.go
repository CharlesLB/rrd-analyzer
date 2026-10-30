package httpsurface

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	searchesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/domain"
	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

const (
	jsonContentType = "application/json"

	// maximumBodyBytes bounds a request body. The largest one this server reads is a canvas or a
	// window request, a few hundred bytes; a megabyte leaves room without letting a caller make the
	// server buffer anything it sends.
	maximumBodyBytes = 1 << 20
)

type createAnalysisBody struct {
	Name  string             `json:"name"`
	Files []surface.FileInfo `json:"files"`
}

type addSourcesBody struct {
	Files []surface.FileInfo `json:"files"`
}

type developmentAnalysisBody struct {
	Name                     string                       `json:"name"`
	Files                    []surface.FileInfo           `json:"files"`
	Canvas                   []analysisDomain.CanvasChart `json:"canvas"`
	LastAccessedMilliseconds int64                        `json:"lastAccessedMilliseconds"`
}

type renameBody struct {
	Name string `json:"name"`
}

type canvasBody struct {
	Canvas []analysisDomain.CanvasChart `json:"canvas"`
}

type libraryOrderBody struct {
	LibraryOrder []analysisDomain.ChartReference `json:"libraryOrder"`
}

// seriesColorBody is the series a person recolored and the color they picked, an empty color giving
// the series back its default one. The fields are the stored entry's, written at the top level.
type seriesColorBody struct {
	analysisDomain.SeriesColor
}

type searchTermBody struct {
	Term string `json:"term"`
}

type csvExport struct {
	FileName    string `json:"fileName"`
	Content     string `json:"content"`
	SampleCount int    `json:"sampleCount"`
	SeriesCount int    `json:"seriesCount"`
}

// sourcesExport carries the copied bytes as base64, which is how encoding/json writes a byte slice.
type sourcesExport struct {
	FileName  string `json:"fileName"`
	Content   []byte `json:"content"`
	FileCount int    `json:"fileCount"`
}

// UnavailableDialogs stands in for the halves of the surface only a native window can provide,
// and says so rather than failing silently or pretending an export was written. Over HTTP an export
// is answered with its bytes, and the page downloads them.
type UnavailableDialogs struct{}

func (UnavailableDialogs) PickSources(context.Context) ([]surface.FileInfo, error) {
	return nil, errors.New("native file dialogs are only available in the desktop window")
}

func (UnavailableDialogs) PickSaveTarget(context.Context, string) (string, error) {
	return "", errors.New("native save dialogs are only available in the desktop window")
}

func (UnavailableDialogs) Write(context.Context, string, []byte) error {
	return errors.New("exports are downloaded by the page, never written to disk from here")
}

func decode(writer http.ResponseWriter, request *http.Request, target any) bool {
	return decodeWithin(writer, request, target, maximumBodyBytes)
}

// decodeWithin reads a body of at most limit bytes, for the one route whose body can carry a file.
func decodeWithin(writer http.ResponseWriter, request *http.Request, target any, limit int64) bool {
	if err := json.NewDecoder(http.MaxBytesReader(writer, request.Body, limit)).Decode(target); err != nil {
		http.Error(writer, "malformed request body", http.StatusBadRequest)

		return false
	}

	return true
}

func respond[T any](writer http.ResponseWriter, payload T, err error) {
	respondWith(writer, http.StatusOK, payload, err)
}

// respondCreated answers a request that started something: a live session, or a copy of one.
func respondCreated[T any](writer http.ResponseWriter, payload T, err error) {
	respondWith(writer, http.StatusCreated, payload, err)
}

func respondWith[T any](writer http.ResponseWriter, status int, payload T, err error) {
	if err != nil {
		fail(writer, err)

		return
	}

	writer.Header().Set("Content-Type", jsonContentType)
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(payload); err != nil {
		log.Println("encode response:", err)
	}
}

func respondEmpty(writer http.ResponseWriter, err error) {
	if err != nil {
		fail(writer, err)

		return
	}

	writer.WriteHeader(http.StatusNoContent)
}

func fail(writer http.ResponseWriter, err error) {
	log.Println("request failed:", err)
	http.Error(writer, err.Error(), statusOf(err))
}

// statusOf is what a domain error means in HTTP.
//
// A request that names something that does not exist is a 404, and one the caller built wrong is a
// 400. A well-formed request over a source that cannot become series, or cannot be copied, is a 422:
// the file is missing, has no path, is not an RRD database or dump, has no rows, or is laid out in a
// way this build cannot read, and in every case a different file is the remedy, not a different
// request.
//
// A live session answers in the statuses of docs/SHARING.md: a session or a link that is gone is a
// 404 like any analysis; a share service that could not be reached is the 502 of a gateway, one that
// refuses for size or for rate is its 413 or 429, and a build given no service is a 503 for every
// session route. Following a session where no file can be kept in memory is a 501: the request is
// right, this binary cannot do it.
//
// The last case names the errors that are the server's own fault on purpose, so every domain error
// is decided here rather than left to the fallback: embedded insights defaults that do not parse
// ship in the binary, and a missing rrdtool is missing from the machine the server runs on, so no
// request could have avoided either.
func statusOf(err error) int {
	switch {
	case errors.Is(err, analysisDomain.ErrAnalysisNotFound), errors.Is(err, analysisDomain.ErrSeriesNotFound),
		errors.Is(err, insightsDomain.ErrUnknownSeries),
		errors.Is(err, sharingDomain.ErrNotLive), errors.Is(err, sharingDomain.ErrNotFollowed), errors.Is(err, sharingDomain.ErrSessionEnded):
		return http.StatusNotFound
	case errors.Is(err, sharingDomain.ErrNotConfigured):
		return http.StatusServiceUnavailable
	case errors.Is(err, sharingDomain.ErrViewingUnavailable):
		return http.StatusNotImplemented
	case errors.Is(err, sharingDomain.ErrTooLarge):
		return http.StatusRequestEntityTooLarge
	case errors.Is(err, sharingDomain.ErrServiceBusy):
		return http.StatusTooManyRequests
	case errors.Is(err, sharingDomain.ErrServiceFailed):
		return http.StatusBadGateway
	case errors.Is(err, sharingDomain.ErrLinkInvalid), errors.Is(err, sharingDomain.ErrLogContentMissing), errors.Is(err, sharingDomain.ErrLogViewInvalid):
		return http.StatusBadRequest
	case errors.Is(err, sharingDomain.ErrKeyRefused), errors.Is(err, sharingDomain.ErrSourceUnlocated), errors.Is(err, sharingDomain.ErrSourceUnreadable),
		errors.Is(err, sharingDomain.ErrNotASource):
		return http.StatusUnprocessableEntity
	case errors.Is(err, analysisDomain.ErrNoSources), errors.Is(err, analysisDomain.ErrNameEmpty), errors.Is(err, analysisDomain.ErrChartFull),
		errors.Is(err, analysisDomain.ErrAxisUnknown), errors.Is(err, analysisDomain.ErrStatisticUnknown),
		errors.Is(err, analysisDomain.ErrColorInvalid),
		errors.Is(err, exportDomain.ErrNothingToExport),
		errors.Is(err, insightsDomain.ErrAnalysisRequired), errors.Is(err, insightsDomain.ErrUnknownScope),
		errors.Is(err, insightsDomain.ErrViewportWindowRequired),
		errors.Is(err, searchesDomain.ErrFieldInvalid), errors.Is(err, searchesDomain.ErrTermEmpty), errors.Is(err, searchesDomain.ErrTermTooLong):
		return http.StatusBadRequest
	case errors.Is(err, analysisDomain.ErrSourceUnlocated), errors.Is(err, rrdDomain.ErrUnreadableSource),
		errors.Is(err, rrdDomain.ErrNotAnRRDDump), errors.Is(err, rrdDomain.ErrEmptyArchive),
		errors.Is(err, rrdDomain.ErrUnreadableLayout), errors.Is(err, exportDomain.ErrSourceUnlocated),
		errors.Is(err, exportDomain.ErrSourceUnreadable), errors.Is(err, exportDomain.ErrNotASource):
		return http.StatusUnprocessableEntity
	case errors.Is(err, insightsDomain.ErrDefaultConfiguration), errors.Is(err, rrdDomain.ErrDumpToolMissing):
		return http.StatusInternalServerError
	}

	return http.StatusInternalServerError
}
