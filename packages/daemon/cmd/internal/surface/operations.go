// Package surface is the application's single surface: every operation the desktop
// window can invoke, expressed without knowing whether it was reached through a
// Wails binding or an HTTP request in development.
package surface

import (
	"context"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/usecase"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	insightsUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	searchesUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/version"
	sharingUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/usecase"
)

type FilePicker interface {
	PickSources(callerContext context.Context) ([]FileInfo, error)
}

// SourceDescriber reads back the identity of paths a person chose: a picked file's size, and the
// sources inside a dropped folder.
type SourceDescriber interface {
	Describe(callerContext context.Context, paths []string) ([]FileInfo, error)
}

// FileInfo is a source file at the boundary, in both directions: what a native dialog picked,
// and what the frontend hands back when it asks for an analysis to be created.
type FileInfo = analysisDomain.SourceFile

// CSVDocument is an encoded CSV export and what it holds.
type CSVDocument = exportDomain.CSVDocument

type AnalysisView struct {
	ID                       string                       `json:"id"`
	Name                     string                       `json:"name"`
	Canvas                   []analysisDomain.CanvasChart `json:"canvas"`
	LastAccessedMilliseconds int64                        `json:"lastAccessedMilliseconds"`
}

// AddedSourcesView is an analysis after files were added to it, and how many of them were new.
type AddedSourcesView struct {
	Analysis AnalysisView `json:"analysis"`
	Added    int          `json:"added"`
}

type ExportRequest struct {
	AnalysisID        string   `json:"analysisId"`
	SeriesIDs         []string `json:"seriesIds"`
	FromMilliseconds  int64    `json:"fromMilliseconds"`
	UntilMilliseconds int64    `json:"untilMilliseconds"`
}

// ExportResult is an export that reached disk, as the window reads it back.
type ExportResult = exportDomain.SavedExport

// SourcesDocument is the copy of an analysis' sources: the one file, or an archive of several.
type SourcesDocument = exportDomain.SourcesDocument

// SourcesExportResult is a copy of the sources that reached disk, as the window reads it back.
type SourcesExportResult = exportDomain.SavedSources

// Dependencies is everything the surface reaches the application through. Every field is required.
type Dependencies struct {
	Analyses *analysisUsecase.Service
	Insights *insightsUsecase.Service
	Exports  *exportUsecase.Service
	Searches *searchesUsecase.Service
	Sharing  *sharingUsecase.Service
	Sources  SourceDescriber
	Picker   FilePicker
}

type Operations struct {
	analyses *analysisUsecase.Service
	insights *insightsUsecase.Service
	exports  *exportUsecase.Service
	searches *searchesUsecase.Service
	sharing  *sharingUsecase.Service
	sources  SourceDescriber
	picker   FilePicker
}

func New(dependencies Dependencies) *Operations {
	if dependencies.Analyses == nil || dependencies.Insights == nil || dependencies.Exports == nil || dependencies.Searches == nil ||
		dependencies.Sharing == nil || dependencies.Sources == nil || dependencies.Picker == nil {
		panic("surface: the analyses, insights, exports, searches and sharing services, the source describer and the file picker are all required")
	}

	return &Operations{
		analyses: dependencies.Analyses,
		insights: dependencies.Insights,
		exports:  dependencies.Exports,
		searches: dependencies.Searches,
		sharing:  dependencies.Sharing,
		sources:  dependencies.Sources,
		picker:   dependencies.Picker,
	}
}

// BuildInfo is the build's identity, and whether it was given a share service: the frontend offers
// live sessions only when it was.
type BuildInfo struct {
	Version        string `json:"version"`
	Commit         string `json:"commit"`
	Date           string `json:"date"`
	Summary        string `json:"summary"`
	SharesSessions bool   `json:"sharesSessions"`
}

func (operations *Operations) Build() BuildInfo {
	return BuildInfo{
		Version:        version.Version,
		Commit:         version.Commit,
		Date:           version.Date,
		Summary:        version.Summary(),
		SharesSessions: operations.sharing.SharesSessions(),
	}
}

func (operations *Operations) ListAnalyses(callerContext context.Context) ([]AnalysisView, error) {
	stored, err := operations.analyses.List(callerContext)
	if err != nil {
		return nil, err
	}

	views := make([]AnalysisView, 0, len(stored))
	for _, analysis := range stored {
		views = append(views, viewOf(analysis))
	}

	return views, nil
}

func (operations *Operations) SelectRRDFiles(callerContext context.Context) ([]FileInfo, error) {
	return operations.picker.PickSources(callerContext)
}

func (operations *Operations) DescribeSources(callerContext context.Context, paths []string) ([]FileInfo, error) {
	return operations.sources.Describe(callerContext, paths)
}

func (operations *Operations) CreateAnalysis(callerContext context.Context, name string, files []FileInfo) (AnalysisView, error) {
	created, err := operations.analyses.Create(callerContext, name, files)
	if err != nil {
		return AnalysisView{}, err
	}

	return viewOf(created), nil
}

func (operations *Operations) AddSources(callerContext context.Context, analysisID string, files []FileInfo) (AddedSourcesView, error) {
	added, err := operations.analyses.AddSources(callerContext, analysisID, files)
	if err != nil {
		return AddedSourcesView{}, err
	}

	return AddedSourcesView{Analysis: viewOf(added.Analysis), Added: added.Added}, nil
}

// SeededAnalysis is an analysis created straight into a state real use would take days to reach.
// Only the development server offers it; the desktop window has no such binding.
type SeededAnalysis = analysisUsecase.SeededAnalysis

// CreateSeededAnalysis and ResetLibrary exist for the development routes, which put the library
// into the exact states the end-to-end suite and the design check photograph.
func (operations *Operations) CreateSeededAnalysis(callerContext context.Context, seeded SeededAnalysis) (AnalysisView, error) {
	created, err := operations.analyses.CreateSeeded(callerContext, seeded)
	if err != nil {
		return AnalysisView{}, err
	}

	return viewOf(created), nil
}

// ResetLibrary also forgets every search, so a development run that starts over starts with fields
// that suggest nothing.
func (operations *Operations) ResetLibrary(callerContext context.Context) error {
	if err := operations.analyses.DeleteAll(callerContext); err != nil {
		return err
	}

	return operations.searches.DeleteAll(callerContext)
}

func (operations *Operations) SaveCanvas(callerContext context.Context, analysisID string, canvas []analysisDomain.CanvasChart) error {
	return operations.analyses.SaveCanvas(callerContext, analysisID, canvas)
}

func (operations *Operations) SaveLibraryOrder(callerContext context.Context, analysisID string, order []analysisDomain.ChartReference) error {
	return operations.analyses.SaveLibraryOrder(callerContext, analysisID, order)
}

func (operations *Operations) SaveSeriesColor(callerContext context.Context, analysisID string, color analysisDomain.SeriesColor) error {
	return operations.analyses.SaveSeriesColor(callerContext, analysisID, color)
}

func (operations *Operations) RenameAnalysis(callerContext context.Context, analysisID string, name string) (AnalysisView, error) {
	renamed, err := operations.analyses.Rename(callerContext, analysisID, name)
	if err != nil {
		return AnalysisView{}, err
	}

	return viewOf(renamed), nil
}

// DeleteAnalysis first lets go of whatever is live about the analysis: a session it owns is ended,
// and the files of a session it follows are dropped from memory.
func (operations *Operations) DeleteAnalysis(callerContext context.Context, analysisID string) error {
	if err := operations.sharing.Release(callerContext, analysisID); err != nil {
		return err
	}

	return operations.analyses.Delete(callerContext, analysisID)
}

func (operations *Operations) OpenAnalysis(callerContext context.Context, analysisID string) (seriesDomain.Bundle, error) {
	return operations.analyses.Open(callerContext, analysisID)
}

func (operations *Operations) MissingSources(callerContext context.Context, analysisID string) ([]FileInfo, error) {
	return operations.analyses.MissingSources(callerContext, analysisID)
}

func (operations *Operations) FetchSeries(callerContext context.Context, request analysisUsecase.WindowRequest) ([]seriesDomain.Window, error) {
	return operations.analyses.Windows(callerContext, request)
}

func (operations *Operations) FetchChart(callerContext context.Context, request analysisUsecase.WindowRequest) (analysisUsecase.Chart, error) {
	return operations.analyses.Chart(callerContext, request)
}

func (operations *Operations) SearchHistory(callerContext context.Context, field string) ([]string, error) {
	return operations.searches.History(callerContext, field)
}

func (operations *Operations) RememberSearch(callerContext context.Context, field string, term string) ([]string, error) {
	return operations.searches.Remember(callerContext, field, term)
}

func (operations *Operations) ForgetSearch(callerContext context.Context, field string, term string) ([]string, error) {
	return operations.searches.Forget(callerContext, field, term)
}

func (operations *Operations) RunInsights(callerContext context.Context, request insightsDomain.Request) (insightsDomain.Report, error) {
	return operations.insights.Run(callerContext, request)
}

func (operations *Operations) InsightsConfiguration(callerContext context.Context) (insightsDomain.ConfigurationStamp, error) {
	return operations.insights.ConfigurationStamp(callerContext)
}

func (operations *Operations) EncodeCSVExport(callerContext context.Context, request ExportRequest) (CSVDocument, error) {
	return operations.exports.EncodeCSV(callerContext, csvRequestOf(request))
}

func csvRequestOf(request ExportRequest) exportDomain.CSVRequest {
	return exportDomain.CSVRequest{
		AnalysisID:        request.AnalysisID,
		SeriesIDs:         request.SeriesIDs,
		FromMilliseconds:  request.FromMilliseconds,
		UntilMilliseconds: request.UntilMilliseconds,
	}
}

func (operations *Operations) ExportCSV(callerContext context.Context, request ExportRequest) (ExportResult, error) {
	return operations.exports.SaveCSV(callerContext, csvRequestOf(request))
}

func (operations *Operations) ExportImage(callerContext context.Context, suggestedName string, content []byte) (string, error) {
	return operations.exports.SaveImage(callerContext, suggestedName, content)
}

func (operations *Operations) EncodeSourcesExport(callerContext context.Context, analysisID string) (SourcesDocument, error) {
	return operations.exports.EncodeSources(callerContext, analysisID)
}

func (operations *Operations) ExportSources(callerContext context.Context, analysisID string) (SourcesExportResult, error) {
	return operations.exports.SaveSources(callerContext, analysisID)
}

func viewOf(analysis analysisDomain.Analysis) AnalysisView {
	return AnalysisView{
		ID:                       analysis.ID,
		Name:                     analysis.Name,
		Canvas:                   analysis.Canvas,
		LastAccessedMilliseconds: analysis.LastAccessed.UnixMilli(),
	}
}
