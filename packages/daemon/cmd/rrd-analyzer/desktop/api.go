package desktop

import (
	"context"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

type API struct {
	operations *surface.Operations
	dialogs    *dialogs
	runs       *insightRuns

	windowContext context.Context
}

func NewAPI(operations *surface.Operations, windowDialogs *dialogs) *API {
	if operations == nil || windowDialogs == nil {
		panic("desktop api: the application surface and the dialogs are both required")
	}

	return &API{operations: operations, dialogs: windowDialogs, runs: newInsightRuns()}
}

func (bound *API) start(windowContext context.Context) {
	bound.windowContext = windowContext
	bound.dialogs.bindTo(windowContext)
}

func (bound *API) context() context.Context {
	if bound.windowContext == nil {
		return context.Background()
	}

	return bound.windowContext
}

func (bound *API) Build() surface.BuildInfo {
	return bound.operations.Build()
}

func (bound *API) ListAnalyses() ([]surface.AnalysisView, error) {
	return bound.operations.ListAnalyses(bound.context())
}

func (bound *API) SelectRRDFiles() ([]surface.FileInfo, error) {
	return bound.operations.SelectRRDFiles(bound.context())
}

func (bound *API) DescribeSources(paths []string) ([]surface.FileInfo, error) {
	return bound.operations.DescribeSources(bound.context(), paths)
}

func (bound *API) CreateAnalysis(name string, files []surface.FileInfo) (surface.AnalysisView, error) {
	return bound.operations.CreateAnalysis(bound.context(), name, files)
}

func (bound *API) AddSources(analysisID string, files []surface.FileInfo) (surface.AddedSourcesView, error) {
	return bound.operations.AddSources(bound.context(), analysisID, files)
}

func (bound *API) RenameAnalysis(analysisID string, name string) (surface.AnalysisView, error) {
	return bound.operations.RenameAnalysis(bound.context(), analysisID, name)
}

func (bound *API) DeleteAnalysis(analysisID string) error {
	return bound.operations.DeleteAnalysis(bound.context(), analysisID)
}

func (bound *API) SaveCanvas(analysisID string, canvas []analysisDomain.CanvasChart) error {
	return bound.operations.SaveCanvas(bound.context(), analysisID, canvas)
}

func (bound *API) SaveLibraryOrder(analysisID string, order []analysisDomain.ChartReference) error {
	return bound.operations.SaveLibraryOrder(bound.context(), analysisID, order)
}

func (bound *API) SaveSeriesColor(analysisID string, color analysisDomain.SeriesColor) error {
	return bound.operations.SaveSeriesColor(bound.context(), analysisID, color)
}

func (bound *API) OpenAnalysis(analysisID string) (seriesDomain.Bundle, error) {
	return bound.operations.OpenAnalysis(bound.context(), analysisID)
}

func (bound *API) MissingSources(analysisID string) ([]surface.FileInfo, error) {
	return bound.operations.MissingSources(bound.context(), analysisID)
}

func (bound *API) FetchSeries(request analysisUsecase.WindowRequest) ([]seriesDomain.Window, error) {
	return bound.operations.FetchSeries(bound.context(), request)
}

func (bound *API) FetchChart(request analysisUsecase.WindowRequest) (analysisUsecase.Chart, error) {
	return bound.operations.FetchChart(bound.context(), request)
}

func (bound *API) ExportCSV(request surface.ExportRequest) (surface.ExportResult, error) {
	return bound.operations.ExportCSV(bound.context(), request)
}

func (bound *API) ExportImage(name string, data []byte) (string, error) {
	return bound.operations.ExportImage(bound.context(), name, data)
}

func (bound *API) ExportSources(analysisID string) (surface.SourcesExportResult, error) {
	return bound.operations.ExportSources(bound.context(), analysisID)
}

// RunInsights runs under the name the page gave it, which is how CancelInsights finds it again.
func (bound *API) RunInsights(runID string, request insightsDomain.Request) (insightsDomain.Report, error) {
	runContext, finish := bound.runs.begin(bound.context(), runID)
	defer finish()

	return bound.operations.RunInsights(runContext, request)
}

func (bound *API) InsightsConfiguration() (insightsDomain.ConfigurationStamp, error) {
	return bound.operations.InsightsConfiguration(bound.context())
}

func (bound *API) SearchHistory(field string) ([]string, error) {
	return bound.operations.SearchHistory(bound.context(), field)
}

func (bound *API) RememberSearch(field string, term string) ([]string, error) {
	return bound.operations.RememberSearch(bound.context(), field, term)
}

func (bound *API) ForgetSearch(field string, term string) ([]string, error) {
	return bound.operations.ForgetSearch(bound.context(), field, term)
}

func (bound *API) CancelInsights(runID string) {
	bound.runs.cancel(runID)
}

func (bound *API) ListSessions() ([]surface.SessionStatus, error) {
	return bound.operations.ListSessions(bound.context())
}

func (bound *API) StartSession(analysisID string, publication surface.SessionPublication) (surface.SessionStatus, error) {
	return bound.operations.StartSession(bound.context(), analysisID, publication)
}

func (bound *API) PublishSession(analysisID string, publication surface.SessionPublication) (surface.SessionStatus, error) {
	return bound.operations.PublishSession(bound.context(), analysisID, publication)
}

func (bound *API) SessionStatus(analysisID string) (surface.SessionStatus, error) {
	return bound.operations.SessionStatus(bound.context(), analysisID)
}

func (bound *API) EndSession(analysisID string) error {
	return bound.operations.EndSession(bound.context(), analysisID)
}
