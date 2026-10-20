package usecase_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

type memoryStore struct {
	rows []analysisDomain.Analysis
}

func (store *memoryStore) List(context.Context) ([]analysisDomain.Analysis, error) {
	return append([]analysisDomain.Analysis(nil), store.rows...), nil
}

func (store *memoryStore) Save(_ context.Context, analysis analysisDomain.Analysis) error {
	for index, existing := range store.rows {
		if existing.ID == analysis.ID {
			store.rows[index] = analysis

			return nil
		}
	}

	store.rows = append(store.rows, analysis)

	return nil
}

func (store *memoryStore) Get(_ context.Context, analysisID string) (analysisDomain.Analysis, error) {
	for _, existing := range store.rows {
		if existing.ID == analysisID {
			return existing, nil
		}
	}

	return analysisDomain.Analysis{}, fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
}

func (store *memoryStore) Touch(callerContext context.Context, analysisID string, accessed time.Time) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) { analysis.LastAccessed = accessed })
}

func (store *memoryStore) Rename(callerContext context.Context, analysisID string, name string) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) { analysis.Name = name })
}

func (store *memoryStore) SaveCanvas(callerContext context.Context, analysisID string, canvas []analysisDomain.CanvasChart) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) { analysis.Canvas = canvas })
}

func (store *memoryStore) SaveLibraryOrder(callerContext context.Context, analysisID string, order []analysisDomain.ChartReference) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) { analysis.LibraryOrder = order })
}

func (store *memoryStore) SaveSeriesColors(callerContext context.Context, analysisID string, colors []analysisDomain.SeriesColor) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) { analysis.SeriesColors = colors })
}

func (store *memoryStore) update(_ context.Context, analysisID string, change func(*analysisDomain.Analysis)) error {
	for index := range store.rows {
		if store.rows[index].ID == analysisID {
			change(&store.rows[index])

			return nil
		}
	}

	return fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
}

func (store *memoryStore) AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) ([]analysisDomain.SourceFile, error) {
	var added []analysisDomain.SourceFile

	err := store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) {
		added = analysisDomain.SourcesNotListed(analysis.Files, files)
		analysis.Files = append(analysis.Files, added...)
	})

	return added, err
}

func (store *memoryStore) Delete(_ context.Context, analysisID string) error {
	kept := store.rows[:0]
	for _, existing := range store.rows {
		if existing.ID != analysisID {
			kept = append(kept, existing)
		}
	}
	store.rows = kept

	return nil
}

type twoPointLoader struct{ calls int }

func (loader *twoPointLoader) Load(context.Context, []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	loader.calls++
	maximum := 100.0

	return []seriesDomain.Series{{
		DataSourceMaximum: &maximum,
		Name:              "host_cpu",
		Label:             "cpu",
		Unit:              "%",
		StartMilliseconds: 0,
		StepMilliseconds:  300000,
		Archives: []seriesDomain.Archive{{
			Function:          seriesDomain.ConsolidationAverage,
			StepMilliseconds:  300000,
			StartMilliseconds: 0,
			Samples:           []seriesDomain.Sample{seriesDomain.Known(10), seriesDomain.Known(30)},
		}},
	}}, nil
}

// yearArchiveLoader holds what rrdtool writes for a file created a year ago but fed for two days:
// a daily archive allocated for the whole year, unknown until its last two rows, beside a series
// that never stored anything.
type yearArchiveLoader struct{}

func (yearArchiveLoader) Load(context.Context, []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	samples := make([]seriesDomain.Sample, 365)
	samples[363], samples[364] = seriesDomain.Known(1), seriesDomain.Known(2)

	daily := func(name string, rows []seriesDomain.Sample) seriesDomain.Series {
		return seriesDomain.Series{
			Name:              name,
			StartMilliseconds: 0,
			StepMilliseconds:  timeunit.MillisecondsPerDay,
			Archives: []seriesDomain.Archive{{
				Function: seriesDomain.ConsolidationAverage, StepMilliseconds: timeunit.MillisecondsPerDay, StartMilliseconds: 0, Samples: rows,
			}},
		}
	}

	return []seriesDomain.Series{daily("fed", samples), daily("silent", make([]seriesDomain.Sample, 365))}, nil
}

type fixedClock struct{}

func (fixedClock) Now() time.Time { return time.Date(2026, time.August, 29, 15, 0, 0, 0, time.UTC) }

func newService(loader analysisDomain.SourceLoader) (*analysisUsecase.Service, *memoryStore) {
	store := &memoryStore{}

	return analysisUsecase.NewService(store, loader, fixedClock{}), store
}

func TestCreateRejectsAnAnalysisWithoutSources(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	if _, err := service.Create(context.Background(), "anything", nil); !errors.Is(err, analysisDomain.ErrNoSources) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrNoSources)
	}
}

func TestCreateNamesAnUnnamedAnalysisAfterItsOnlySource(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	created, err := service.Create(context.Background(), "   ", []analysisDomain.SourceFile{{Name: "atlas-prod.rrd", Path: "/tmp/atlas-prod.rrd"}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if created.Name != "atlas-prod" {
		t.Errorf("name = %q, want atlas-prod", created.Name)
	}
}

func TestCreateNamesAnUnnamedAnalysisOfABareExtensionAsUntitled(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	created, err := service.Create(context.Background(), "", []analysisDomain.SourceFile{{Name: ".rrd", Path: "/tmp/.rrd"}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if created.Name != "Untitled analysis" {
		t.Errorf("name = %q, want Untitled analysis", created.Name)
	}
}

func TestCreateFallsBackToAPlaceholderForSeveralSources(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	created, err := service.Create(context.Background(), "", []analysisDomain.SourceFile{{Name: "a.rrd"}, {Name: "b.rrd"}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if created.Name != "Untitled analysis" {
		t.Errorf("name = %q, want Untitled analysis", created.Name)
	}
}

func TestCreateStartsOnAnEmptyCanvas(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	created, err := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if created.Canvas == nil || len(created.Canvas) != 0 {
		t.Errorf("canvas = %#v, want an empty canvas", created.Canvas)
	}
}

func TestOpenParsesTheSourcesOnceAndReusesThem(t *testing.T) {
	loader := &twoPointLoader{}
	service, _ := newService(loader)

	created, err := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	first, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	if _, err := service.Open(context.Background(), created.ID); err != nil {
		t.Fatalf("reopen: %v", err)
	}

	if loader.calls != 1 {
		t.Errorf("loader called %d times, want 1: an open window must not re-read the file", loader.calls)
	}
	if first.AnalysisName != "Capacity" {
		t.Errorf("bundle name = %q, want Capacity", first.AnalysisName)
	}
	if first.Series[0].ID != "s0" || first.Series[0].Color != "#005581" {
		t.Errorf("series must be given a stable id and the first palette colour, got %+v", first.Series[0])
	}
}

func TestOpenRestoresTheSavedCanvasAndDropsChartsTheSourcesNoLongerHold(t *testing.T) {
	service, _ := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	if _, err := service.Open(context.Background(), created.ID); err != nil {
		t.Fatalf("open: %v", err)
	}

	canvas := []analysisDomain.CanvasChart{{SeriesID: "s0", Label: "cpu"}, {SeriesID: "s7", Label: "gone"}}
	if err := service.SaveCanvas(context.Background(), created.ID, canvas); err != nil {
		t.Fatalf("save canvas: %v", err)
	}

	reopened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}

	if want := [][]string{{"s0@0"}}; !reflect.DeepEqual(plottedOf(reopened), want) {
		t.Errorf("canvas = %v, want %v", plottedOf(reopened), want)
	}

	listed, _ := service.List(context.Background())
	if len(listed[0].Canvas) != 2 || listed[0].Canvas[1].Label != "gone" {
		t.Errorf("stored canvas = %+v, want both charts kept as saved", listed[0].Canvas)
	}
}

// labelledLoader holds one series per label, in the order given, as files read after a change
// would: a data source added or files reordered moves every series behind it to a new position.
type labelledLoader struct{ labels []string }

func (loader labelledLoader) Load(context.Context, []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	series := make([]seriesDomain.Series, 0, len(loader.labels))
	for _, label := range loader.labels {
		series = append(series, seriesDomain.Series{
			Name:             "host_" + label,
			Label:            label,
			StepMilliseconds: 300000,
			Archives: []seriesDomain.Archive{{
				Function:         seriesDomain.ConsolidationAverage,
				StepMilliseconds: 300000,
				Samples:          []seriesDomain.Sample{seriesDomain.Known(1)},
			}},
		})
	}

	return series, nil
}

func TestOpenFindsEachSavedChartByItsLabelOnceTheSourcesHaveMovedItsSeries(t *testing.T) {
	service, _ := newService(labelledLoader{labels: []string{"disk", "cpu", "memory", "load", "load"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	savedBeforeDiskWasAdded := []analysisDomain.CanvasChart{
		{SeriesID: "s0", Label: "cpu"},
		{SeriesID: "s1", Label: "memory"},
		{SeriesID: "s3", Label: "load"},
		{SeriesID: "s9", Label: "load"},
	}
	if err := service.SaveCanvas(context.Background(), created.ID, savedBeforeDiskWasAdded); err != nil {
		t.Fatalf("save canvas: %v", err)
	}

	reopened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	want := [][]string{{"s1@0"}, {"s2@0"}, {"s3@0"}}
	if !reflect.DeepEqual(plottedOf(reopened), want) {
		t.Errorf("canvas = %v, want %v: cpu and memory where they now sit, the load still at its own "+
			"position, and the load that two series now answer to left off", plottedOf(reopened), want)
	}
}

func TestOpenRestoresTheSeriesMergedIntoEachChartOnTheAxesTheyWereSavedWith(t *testing.T) {
	service, _ := newService(labelledLoader{labels: []string{"cpu", "memory", "load", "disk"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	canvas := []analysisDomain.CanvasChart{
		{SeriesID: "s0", Label: "cpu", Merged: []analysisDomain.MergedSeries{{SeriesID: "s2", Label: "load", Axis: 1}, {SeriesID: "s3", Label: "disk", Axis: 0}}},
		{SeriesID: "s1", Label: "memory", Merged: []analysisDomain.MergedSeries{}},
	}
	if err := service.SaveCanvas(context.Background(), created.ID, canvas); err != nil {
		t.Fatalf("save canvas: %v", err)
	}

	reopened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	if want := [][]string{{"s0@0", "s2@1", "s3@0"}, {"s1@0"}}; !reflect.DeepEqual(plottedOf(reopened), want) {
		t.Errorf("canvas = %v, want %v", plottedOf(reopened), want)
	}
}

func TestOpenKeepsAMergedChartWhoseFirstSeriesIsGoneAndNeverDrawsASeriesTwice(t *testing.T) {
	service, _ := newService(labelledLoader{labels: []string{"cpu", "memory", "load"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	canvas := []analysisDomain.CanvasChart{
		{SeriesID: "s7", Label: "gone", Merged: []analysisDomain.MergedSeries{{SeriesID: "s1", Label: "memory", Axis: 1}, {SeriesID: "s8", Label: "also gone", Axis: 2}}},
		{SeriesID: "s0", Label: "cpu", Merged: []analysisDomain.MergedSeries{{SeriesID: "s1", Label: "memory", Axis: 1}, {SeriesID: "s2", Label: "load", Axis: 0}}},
		{SeriesID: "s9", Label: "gone too", Merged: []analysisDomain.MergedSeries{}},
	}
	if err := service.SaveCanvas(context.Background(), created.ID, canvas); err != nil {
		t.Fatalf("save canvas: %v", err)
	}

	reopened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	want := [][]string{{"s1@1"}, {"s0@0", "s2@0"}}
	if !reflect.DeepEqual(plottedOf(reopened), want) {
		t.Errorf("canvas = %v, want %v: memory kept as the first chart once the series it was merged into is gone, "+
			"left off the second chart it was already drawn in, and the chart with nothing left dropped", plottedOf(reopened), want)
	}
}

// plottedOf writes each chart of a bundle's canvas as its series, each followed by the axis it is
// read against, so a whole canvas compares in one expression.
func plottedOf(bundle seriesDomain.Bundle) [][]string {
	charts := make([][]string, 0, len(bundle.Canvas))
	for _, chart := range bundle.Canvas {
		plotted := make([]string, 0, len(chart.Series))
		for _, series := range chart.Series {
			plotted = append(plotted, fmt.Sprintf("%s@%d", series.SeriesID, series.Axis))
		}

		charts = append(charts, plotted)
	}

	return charts
}

func seriesIDsOf(bundle seriesDomain.Bundle) []string {
	ids := make([]string, 0, len(bundle.Series))
	for _, series := range bundle.Series {
		ids = append(ids, series.ID)
	}

	return ids
}

func TestOpenListsTheSeriesInTheSavedLibraryOrderAndThoseItDoesNotNameAfterThem(t *testing.T) {
	service, _ := newService(labelledLoader{labels: []string{"cpu", "memory", "disk", "load"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	order := []analysisDomain.ChartReference{{SeriesID: "s3", Label: "load"}, {SeriesID: "s1", Label: "memory"}}
	if err := service.SaveLibraryOrder(context.Background(), created.ID, order); err != nil {
		t.Fatalf("save library order: %v", err)
	}

	opened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	want := []string{"s3", "s1", "s0", "s2"}
	if fmt.Sprint(seriesIDsOf(opened)) != fmt.Sprint(want) {
		t.Errorf("series = %v, want %v: the two arranged first, then cpu and disk where the sources hold them", seriesIDsOf(opened), want)
	}
}

func TestOpenFindsEachLibraryEntryByItsLabelOnceTheSourcesHaveMovedItsSeries(t *testing.T) {
	service, _ := newService(labelledLoader{labels: []string{"disk", "cpu", "memory"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	savedBeforeDiskWasAdded := []analysisDomain.ChartReference{
		{SeriesID: "s1", Label: "memory"},
		{SeriesID: "s9", Label: "gone"},
		{SeriesID: "s0", Label: "cpu"},
		{SeriesID: "s1", Label: "memory"},
	}
	if err := service.SaveLibraryOrder(context.Background(), created.ID, savedBeforeDiskWasAdded); err != nil {
		t.Fatalf("save library order: %v", err)
	}

	opened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	want := []string{"s2", "s1", "s0"}
	if fmt.Sprint(seriesIDsOf(opened)) != fmt.Sprint(want) {
		t.Errorf("series = %v, want %v: memory and cpu where they now sit, the series the sources no longer "+
			"hold and the repeated entry passed over, and disk after them", seriesIDsOf(opened), want)
	}
}

func TestOpenArrangesTheLibraryWithoutReorderingTheSeriesEveryOtherReaderShares(t *testing.T) {
	service, _ := newService(labelledLoader{labels: []string{"cpu", "memory"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	if err := service.SaveLibraryOrder(context.Background(), created.ID, []analysisDomain.ChartReference{{SeriesID: "s1", Label: "memory"}}); err != nil {
		t.Fatalf("save library order: %v", err)
	}

	if _, err := service.Open(context.Background(), created.ID); err != nil {
		t.Fatalf("open: %v", err)
	}

	shared, err := service.Bundle(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}

	if want := []string{"s0", "s1"}; fmt.Sprint(seriesIDsOf(shared)) != fmt.Sprint(want) {
		t.Errorf("cached series = %v, want %v: charts, exports and insights read the sources' own order", seriesIDsOf(shared), want)
	}
}

func TestRenameStoresTheTrimmedNameAndOpenReadsItBackOverTheCachedSources(t *testing.T) {
	service, _ := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	if _, err := service.Open(context.Background(), created.ID); err != nil {
		t.Fatalf("open: %v", err)
	}

	renamed, err := service.Rename(context.Background(), created.ID, "  Atlas prod · capacity  ")
	if err != nil {
		t.Fatalf("rename: %v", err)
	}

	reopened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}

	if renamed.Name != "Atlas prod · capacity" || reopened.AnalysisName != renamed.Name {
		t.Errorf("renamed %q, reopened as %q, want both Atlas prod · capacity", renamed.Name, reopened.AnalysisName)
	}
}

func TestRenameRefusesABlankNameAndKeepsTheOldOne(t *testing.T) {
	service, store := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	if _, err := service.Rename(context.Background(), created.ID, "   "); !errors.Is(err, analysisDomain.ErrNameEmpty) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrNameEmpty)
	}

	if store.rows[0].Name != "Capacity" {
		t.Errorf("name = %q, want Capacity", store.rows[0].Name)
	}
}

func TestRenameReportsAMissingAnalysis(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	if _, err := service.Rename(context.Background(), "missing", "Capacity"); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestSaveLibraryOrderReportsAMissingAnalysis(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	if err := service.SaveLibraryOrder(context.Background(), "missing", nil); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestSaveCanvasKeepsAsManyChartsAsItIsGiven(t *testing.T) {
	service, _ := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	const manyCharts = 12
	crowded := make([]analysisDomain.CanvasChart, manyCharts)
	if err := service.SaveCanvas(context.Background(), created.ID, crowded); err != nil {
		t.Fatalf("err = %v, want nil", err)
	}
}

func TestSaveCanvasRefusesAChartDrawingMoreThanFiveSeries(t *testing.T) {
	service, _ := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	crowded := []analysisDomain.CanvasChart{{SeriesID: "s0", Merged: make([]analysisDomain.MergedSeries, analysisDomain.MaximumChartSeries)}}
	if err := service.SaveCanvas(context.Background(), created.ID, crowded); !errors.Is(err, analysisDomain.ErrChartFull) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrChartFull)
	}
}

func TestSaveCanvasRefusesAMergedSeriesOnAnAxisItsChartCannotHave(t *testing.T) {
	tests := []struct {
		name     string
		giveAxis int
	}{
		{name: "below the first axis", giveAxis: -1},
		{name: "past one axis per series", giveAxis: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, store := newService(&twoPointLoader{})
			created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

			canvas := []analysisDomain.CanvasChart{{SeriesID: "s0", Merged: []analysisDomain.MergedSeries{{SeriesID: "s1", Axis: tt.giveAxis}}}}
			if err := service.SaveCanvas(context.Background(), created.ID, canvas); !errors.Is(err, analysisDomain.ErrAxisUnknown) {
				t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAxisUnknown)
			}

			if stored, _ := store.Get(context.Background(), created.ID); len(stored.Canvas) != 0 {
				t.Errorf("stored canvas = %+v, want the refused canvas left unsaved", stored.Canvas)
			}
		})
	}
}

func TestOpenReportsAMissingAnalysis(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	if _, err := service.Open(context.Background(), "nope"); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestWindowsRejectsASeriesTheAnalysisDoesNotHave(t *testing.T) {
	service, _ := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	_, err := service.Windows(context.Background(), analysisUsecase.WindowRequest{
		AnalysisID: created.ID, SeriesIDs: []string{"s9"}, UntilMilliseconds: 600000, Columns: 2,
	})
	if !errors.Is(err, analysisDomain.ErrSeriesNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrSeriesNotFound)
	}
}

func TestChartSummarisesTheSameColumnsItDraws(t *testing.T) {
	service, _ := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	chart, err := service.Chart(context.Background(), analysisUsecase.WindowRequest{
		AnalysisID: created.ID, SeriesIDs: []string{"s0"}, UntilMilliseconds: 600000, Columns: 2,
	})
	if err != nil {
		t.Fatalf("chart: %v", err)
	}

	if len(chart.Windows) != 1 || len(chart.Statistics) != 1 || chart.Statistics[0].SeriesID != "s0" || !chart.Statistics[0].HasData {
		t.Fatalf("chart = %+v, want one window and its statistics", chart)
	}

	if got := chart.Statistics[0].Statistics; got.Minimum != 10 || got.Maximum != 30 || got.Last != 30 {
		t.Errorf("statistics = %+v, want the minimum, maximum and last of the columns drawn: 10, 30, 30", got)
	}
}

func TestChartRefusesASeriesTheAnalysisDoesNotHold(t *testing.T) {
	service, _ := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	_, err := service.Chart(context.Background(), analysisUsecase.WindowRequest{AnalysisID: created.ID, SeriesIDs: []string{"s9"}, UntilMilliseconds: 600000, Columns: 2})

	if !errors.Is(err, analysisDomain.ErrSeriesNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrSeriesNotFound)
	}
}

func TestWindowsOfAnAnalysisNeverOpenedRecordNoOpening(t *testing.T) {
	service, store := newService(&twoPointLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	before := store.rows[0].LastAccessed

	if _, err := service.Windows(context.Background(), analysisUsecase.WindowRequest{AnalysisID: created.ID, UntilMilliseconds: 600000, Columns: 2}); err != nil {
		t.Fatalf("windows: %v", err)
	}

	if !store.rows[0].LastAccessed.Equal(before) {
		t.Fatalf("reading a window moved the access time from %v to %v", before, store.rows[0].LastAccessed)
	}
}

func TestOpenRecordsTheOpeningAndReadsTheSourcesOnceAcrossReads(t *testing.T) {
	loader := &twoPointLoader{}
	service, store := newService(loader)
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	store.rows[0].LastAccessed = time.Time{}

	if _, err := service.Open(context.Background(), created.ID); err != nil {
		t.Fatalf("open: %v", err)
	}

	if _, err := service.Chart(context.Background(), analysisUsecase.WindowRequest{AnalysisID: created.ID, UntilMilliseconds: 600000, Columns: 2}); err != nil {
		t.Fatalf("chart: %v", err)
	}

	if store.rows[0].LastAccessed.IsZero() || loader.calls != 1 {
		t.Fatalf("opening recorded %v and the sources were read %d times, want the moment recorded and one read", store.rows[0].LastAccessed, loader.calls)
	}
}

func TestOpenOfAFileFedForTwoDaysSpansThoseDaysNotTheYearItsArchiveAllocates(t *testing.T) {
	service, _ := newService(yearArchiveLoader{})
	created, _ := service.Create(context.Background(), "", []analysisDomain.SourceFile{{Name: "fed.rrd"}})

	bundle, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	if bundle.FromMilliseconds != 363*timeunit.MillisecondsPerDay || bundle.UntilMilliseconds != 364*timeunit.MillisecondsPerDay {
		t.Errorf("span = %d..%d, want the two fed days %d..%d", bundle.FromMilliseconds, bundle.UntilMilliseconds, 363*timeunit.MillisecondsPerDay, 364*timeunit.MillisecondsPerDay)
	}
}

func TestOpen_SourcesThatCannotBeRead_RecordNoOpening(t *testing.T) {
	service, store := newService(fileLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "broken.rrd"}})
	created.LastAccessed = time.UnixMilli(1)
	_ = store.Save(context.Background(), created)

	if _, err := service.Open(context.Background(), created.ID); !errors.Is(err, errUnreadableSource) {
		t.Fatalf("open err = %v, want %v", err, errUnreadableSource)
	}

	if stored, _ := store.Get(context.Background(), created.ID); !stored.LastAccessed.Equal(time.UnixMilli(1)) {
		t.Errorf("last accessed = %v, want the failed opening left out of the library's order", stored.LastAccessed)
	}
}
