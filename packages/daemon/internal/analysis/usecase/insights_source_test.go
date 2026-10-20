package usecase_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

func newInsightsSource(t *testing.T) (*analysisUsecase.InsightsSource, string, *twoPointLoader) {
	t.Helper()

	loader := &twoPointLoader{}
	service, _ := newService(loader)

	created, err := service.Create(context.Background(), "capacity", []analysisDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd", Size: 1}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	return analysisUsecase.NewInsightsSource(service), created.ID, loader
}

func TestInsightsSourceCatalogsTheParsedSeriesAndTheirSpan(t *testing.T) {
	source, analysisID, loader := newInsightsSource(t)

	catalog, err := source.Catalog(context.Background(), analysisID)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	if len(catalog.Series) != 1 || catalog.Series[0].ID != "s0" || catalog.Series[0].StepMilliseconds != 300000 {
		t.Fatalf("series = %+v, want one s0 at a five-minute step", catalog.Series)
	}

	if maximum := catalog.Series[0].DataSourceMaximum; maximum == nil || *maximum != 100 {
		t.Fatalf("maximum = %v, want the 100 the file declares, for rules measured against ds.max", maximum)
	}

	if catalog.FromMilliseconds != 0 || catalog.UntilMilliseconds != 300000 {
		t.Fatalf("span = %d..%d, want 0..300000", catalog.FromMilliseconds, catalog.UntilMilliseconds)
	}

	again, err := source.Catalog(context.Background(), analysisID)
	if err != nil {
		t.Fatalf("second catalog: %v", err)
	}

	if catalog.Fingerprint == "" || catalog.Fingerprint != again.Fingerprint {
		t.Fatalf("fingerprints %q and %q, want one stable value", catalog.Fingerprint, again.Fingerprint)
	}

	if loader.calls != 1 {
		t.Fatalf("sources parsed %d times, want once", loader.calls)
	}
}

func TestInsightsSourceReadsTheAverageWhenTheFileKeepsNoOtherConsolidation(t *testing.T) {
	source, analysisID, _ := newInsightsSource(t)

	samples, err := source.Read(context.Background(), insightsDomain.ReadRequest{
		AnalysisID:        analysisID,
		SeriesID:          "s0",
		Function:          insightsDomain.FunctionMaximum,
		UntilMilliseconds: 300000,
	})
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if samples.Function != insightsDomain.FunctionAverage || len(samples.Values) != 2 || samples.Values[1] != 30 {
		t.Fatalf("samples = %+v, want the two averages ending in 30", samples)
	}
}

func TestInsightsSourceRejectsASeriesTheAnalysisDoesNotHave(t *testing.T) {
	source, analysisID, _ := newInsightsSource(t)

	_, err := source.Read(context.Background(), insightsDomain.ReadRequest{AnalysisID: analysisID, SeriesID: "s9"})
	if !errors.Is(err, analysisDomain.ErrSeriesNotFound) {
		t.Fatalf("err = %v, want ErrSeriesNotFound", err)
	}
}

// allocatedLoader returns what rrdtool leaves behind when a file is created long before it is
// written: an archive whose first rows were never filled, and a file never written at all.
type allocatedLoader struct{}

func (allocatedLoader) Load(context.Context, []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	archiveOf := func(samples ...seriesDomain.Sample) []seriesDomain.Archive {
		return []seriesDomain.Archive{{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 300000, Samples: samples}}
	}

	return []seriesDomain.Series{
		{Name: "host_cpu", StepMilliseconds: 300000, Archives: archiveOf(seriesDomain.Unknown(), seriesDomain.Unknown(), seriesDomain.Known(5), seriesDomain.Known(6))},
		{Name: "host_cores", StepMilliseconds: 300000, Archives: archiveOf(seriesDomain.Unknown(), seriesDomain.Unknown())},
	}, nil
}

func TestInsightsSourceCatalog_ArchivesAllocatedBeforeTheyWereWritten_SpansOnlyTheReadingsAndMarksSilentSeries(t *testing.T) {
	service, _ := newService(allocatedLoader{})

	created, err := service.Create(context.Background(), "allocated", []analysisDomain.SourceFile{{Name: "host.rrd", Path: "/data/host.rrd", Size: 1}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	catalog, err := analysisUsecase.NewInsightsSource(service).Catalog(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	if catalog.FromMilliseconds != 600000 || catalog.UntilMilliseconds != 900000 {
		t.Errorf("span = %d..%d, want 600000..900000", catalog.FromMilliseconds, catalog.UntilMilliseconds)
	}

	if len(catalog.Series) != 2 || catalog.Series[0].HasNoReadings || !catalog.Series[1].HasNoReadings {
		t.Errorf("series = %+v, want only the second marked as holding no readings", catalog.Series)
	}
}

// silentLoader returns files created and never written: every archive allocated, no row filled.
type silentLoader struct{}

func (silentLoader) Load(context.Context, []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	silentSeries := func(name string, startMilliseconds int64, rows int) seriesDomain.Series {
		return seriesDomain.Series{Name: name, StartMilliseconds: startMilliseconds, StepMilliseconds: 300000, Archives: []seriesDomain.Archive{{
			Function:          seriesDomain.ConsolidationAverage,
			StepMilliseconds:  300000,
			StartMilliseconds: startMilliseconds,
			Samples:           slices.Repeat([]seriesDomain.Sample{seriesDomain.Unknown()}, rows),
		}}}
	}

	return []seriesDomain.Series{silentSeries("host_cpu", 600000, 2), silentSeries("host_cores", 1200000, 1)}, nil
}

func TestInsightsSourceCatalog_NoSeriesEverWritten_SpansTheArchivesAndMarksEverySeriesSilent(t *testing.T) {
	service, _ := newService(silentLoader{})

	created, err := service.Create(context.Background(), "silent", []analysisDomain.SourceFile{{Name: "host.rrd", Path: "/data/host.rrd", Size: 1}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	catalog, err := analysisUsecase.NewInsightsSource(service).Catalog(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("catalog: %v", err)
	}

	if catalog.FromMilliseconds != 600000 || catalog.UntilMilliseconds != 1200000 {
		t.Errorf("span = %d..%d, want the archives' 600000..1200000", catalog.FromMilliseconds, catalog.UntilMilliseconds)
	}

	if len(catalog.Series) != 2 || !catalog.Series[0].HasNoReadings || !catalog.Series[1].HasNoReadings {
		t.Errorf("series = %+v, want both marked as holding no readings", catalog.Series)
	}
}

// namedLoader holds one series read from the file and in the unit it is given.
type namedLoader struct {
	file string
	unit string
}

func (loader namedLoader) Load(context.Context, []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	return []seriesDomain.Series{{File: loader.file, Unit: loader.unit, StepMilliseconds: 300000}}, nil
}

// The parts of the identity were once joined by a bar and hashed, so a bar inside one part moved
// the boundary and two different sets of series shared a fingerprint, and with it a cached report.
func TestInsightsSourceCatalog_SeriesThatDifferOnlyInWhereAPartEnds_HaveDifferentFingerprints(t *testing.T) {
	fingerprintOver := func(loader namedLoader) string {
		store := &memoryStore{}
		service := analysisUsecase.NewService(store, loader, fixedClock{})

		if err := store.Save(context.Background(), analysisDomain.Analysis{ID: "a1", Name: "Capacity", Files: []analysisDomain.SourceFile{{Name: "cpu.rrd"}}}); err != nil {
			t.Fatalf("save: %v", err)
		}

		catalog, err := analysisUsecase.NewInsightsSource(service).Catalog(context.Background(), "a1")
		if err != nil {
			t.Fatalf("catalog: %v", err)
		}

		return catalog.Fingerprint
	}

	if one, other := fingerprintOver(namedLoader{file: "cpu|ms", unit: "B"}), fingerprintOver(namedLoader{file: "cpu", unit: "ms|B"}); one == other {
		t.Errorf("both fingerprints are %q, want series read from different files in different units told apart", one)
	}
}
