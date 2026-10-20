package domain

import (
	"context"
	"time"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// Store is the library as it is persisted. List answers with the analysis opened most recently
// first. Get, Touch, Rename, SaveCanvas, SaveLibraryOrder, SaveSeriesColors and AddSources reach
// one analysis by its identifier, so opening an analysis, renaming it, moving a chart, rearranging
// the chart library or recoloring a series never reads or rewrites the rest of the library; each
// reports ErrAnalysisNotFound for an identifier it does not hold.
//
// AddSources answers with the files it added, which are the requested ones the analysis did not
// already list at the moment of the write: only the store can say that, since a second request may
// have added the same file between this one being read and being written.
type Store interface {
	List(callerContext context.Context) ([]Analysis, error)
	Get(callerContext context.Context, analysisID string) (Analysis, error)
	Save(callerContext context.Context, analysis Analysis) error
	Touch(callerContext context.Context, analysisID string, accessed time.Time) error
	Rename(callerContext context.Context, analysisID string, name string) error
	SaveCanvas(callerContext context.Context, analysisID string, canvas []CanvasChart) error
	SaveLibraryOrder(callerContext context.Context, analysisID string, order []ChartReference) error
	SaveSeriesColors(callerContext context.Context, analysisID string, colors []SeriesColor) error
	AddSources(callerContext context.Context, analysisID string, files []SourceFile) ([]SourceFile, error)
	Delete(callerContext context.Context, analysisID string) error
}

// SeriesReader is how an analysis reaches the series one source file holds. The analysis domain
// declares it; which format the file is in, and how it is decoded, is another domain's business.
type SeriesReader interface {
	ReadSeries(callerContext context.Context, path string) ([]seriesDomain.Series, error)
}

// SourcePresence says whether a source is still on disk where an analysis read it from. An analysis
// keeps the path of each file and never a copy, so a file moved or deleted since is one it can no
// longer open, and the person is owed the name of that file rather than an empty workspace.
type SourcePresence interface {
	Exists(callerContext context.Context, path string) (bool, error)
}

type SourceLoader interface {
	Load(callerContext context.Context, files []SourceFile) ([]seriesDomain.Series, error)
}

// UnitRules is the units a person configured for series whose names say nothing about them, or say
// it wrongly. Rules that cannot be read are left out rather than failing the analysis they would
// have relabelled.
type UnitRules interface {
	Load(callerContext context.Context) []UnitRule
}

type Clock interface {
	Now() time.Time
}
