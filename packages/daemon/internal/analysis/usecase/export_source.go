package usecase

import (
	"context"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// ExportSource is the analysis library as an export reads it: the same parsed bundle and the same
// averaged windows the charts draw, and the files the analysis was created from for a copy of them.
type ExportSource struct {
	analyses *Service
}

func NewExportSource(analyses *Service) *ExportSource {
	if analyses == nil {
		panic("export source: the analysis service is not wired")
	}

	return &ExportSource{analyses: analyses}
}

func (source *ExportSource) Bundle(callerContext context.Context, analysisID string) (seriesDomain.Bundle, error) {
	return source.analyses.Bundle(callerContext, analysisID)
}

func (source *ExportSource) Windows(callerContext context.Context, analysisID string, seriesIDs []string, grid exportDomain.Grid) ([]seriesDomain.Window, error) {
	return source.analyses.Windows(callerContext, WindowRequest{
		AnalysisID:        analysisID,
		SeriesIDs:         seriesIDs,
		FromMilliseconds:  grid.FromMilliseconds,
		UntilMilliseconds: grid.UntilMilliseconds,
		Columns:           grid.Columns,
	})
}

func (source *ExportSource) Sources(callerContext context.Context, analysisID string) (exportDomain.SourceSet, error) {
	analysis, err := source.analyses.find(callerContext, analysisID)
	if err != nil {
		return exportDomain.SourceSet{}, err
	}

	files := make([]exportDomain.SourceFile, 0, len(analysis.Files))
	for _, file := range analysis.Files {
		files = append(files, exportDomain.SourceFile{Name: file.Name, Path: file.Path})
	}

	return exportDomain.SourceSet{AnalysisName: analysis.Name, Files: files}, nil
}
