package surface_test

import (
	"context"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// locatedLoader stands in for the loader of sources on disk, and remembers the files it was asked
// to read.
type locatedLoader struct {
	asked [][]analysisDomain.SourceFile
}

func (loader *locatedLoader) Load(_ context.Context, files []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	loader.asked = append(loader.asked, files)

	return []seriesDomain.Series{{ID: "located"}}, nil
}

func TestNewSampleFallbackLoader_NoLoaderForLocatedSources_Panics(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("construction went through, want a panic naming the missing loader")
		}
	}()

	surface.NewSampleFallbackLoader(nil)
}

func TestSampleFallbackLoaderLoad_ASourceWithAPath_ReadsEverySourceWhereItIs(t *testing.T) {
	located := &locatedLoader{}
	files := []analysisDomain.SourceFile{{Name: "picked.rrd"}, {Name: "cpu.rrd", Path: "/data/cpu.rrd"}}

	series, err := surface.NewSampleFallbackLoader(located).Load(context.Background(), files)

	if err != nil || len(series) != 1 || series[0].ID != "located" || len(located.asked) != 1 || len(located.asked[0]) != len(files) {
		t.Fatalf("loaded %+v, %v after %d reads, want every file read once from where it is", series, err, len(located.asked))
	}
}

func TestSampleFallbackLoaderLoad_NoSourceWithAPath_SynthesisesTheReferenceDataset(t *testing.T) {
	located := &locatedLoader{}

	series, err := surface.NewSampleFallbackLoader(located).Load(context.Background(), []analysisDomain.SourceFile{{Name: "picked.rrd"}})

	if err != nil || len(series) == 0 || len(located.asked) != 0 {
		t.Fatalf("loaded %d series, %v after %d reads from disk, want the synthesised dataset and no read", len(series), err, len(located.asked))
	}
}
