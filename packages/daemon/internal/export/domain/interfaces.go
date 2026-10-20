package domain

import (
	"context"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// SeriesSource is the analysis library as an export reads it. An export never opens a file itself:
// it writes the series the charts draw, averaged the way the charts average them, so a row never
// disagrees with the line it was exported from.
type SeriesSource interface {
	Bundle(callerContext context.Context, analysisID string) (seriesDomain.Bundle, error)
	Windows(callerContext context.Context, analysisID string, seriesIDs []string, grid Grid) ([]seriesDomain.Window, error)
}

// SourceLibrary names the files an analysis was created from. A copy of the sources is exactly those
// files, byte for byte, so it never goes through the parsed series.
type SourceLibrary interface {
	Sources(callerContext context.Context, analysisID string) (SourceSet, error)
}

// SourceReader reads one source file whole.
type SourceReader interface {
	Read(callerContext context.Context, path string) ([]byte, error)
}

// SourceFormat says whether bytes read off disk are a source the application plots. A copy of the
// sources hands a file over byte for byte, and an analysis names its files by path alone, so
// without this an analysis created over any path would be a way to read that file back out.
type SourceFormat interface {
	Recognises(content []byte) bool
}

// SaveTargetPicker asks the person where an export should go. An export never decides a path
// itself, and a cancelled dialog answers with an empty one.
type SaveTargetPicker interface {
	PickSaveTarget(callerContext context.Context, suggestedName string) (string, error)
}

// Writer puts the finished bytes wherever the picker pointed.
type Writer interface {
	Write(callerContext context.Context, path string, content []byte) error
}
