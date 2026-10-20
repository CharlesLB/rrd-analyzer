package surface

import (
	"context"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/synthetic"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// SampleFallbackLoader reads sources through located, and synthesises the reference dataset for an
// analysis whose sources carry no path.
//
// A source with no path is one a browser handed over by name alone. The development server has no
// way to read it, so the fixture stands in for it, which is also what the end-to-end suite and the
// design check plot. Neither the desktop window nor the browser edition uses it: one only ever has
// real paths, and the other keeps every file it reads, its own sample's included, under a path.
type SampleFallbackLoader struct {
	located   analysisDomain.SourceLoader
	synthetic *synthetic.Loader
}

func NewSampleFallbackLoader(located analysisDomain.SourceLoader) *SampleFallbackLoader {
	if located == nil {
		panic("surface: the sample fallback needs a loader for the sources that have a path")
	}

	return &SampleFallbackLoader{located: located, synthetic: synthetic.NewLoader()}
}

func (loader *SampleFallbackLoader) Load(callerContext context.Context, files []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	for _, file := range files {
		if file.Path != "" {
			return loader.located.Load(callerContext, files)
		}
	}

	names := make([]string, 0, len(files))
	for _, file := range files {
		names = append(names, file.Name)
	}

	return loader.synthetic.Load(callerContext, names)
}
