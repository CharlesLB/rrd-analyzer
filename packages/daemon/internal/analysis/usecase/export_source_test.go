package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const fiveMinutesInMilliseconds = 300000

func newExportSource(t *testing.T, files []analysisDomain.SourceFile) (*analysisUsecase.ExportSource, string) {
	t.Helper()

	service, _ := newService(&twoPointLoader{})

	created, err := service.Create(context.Background(), "Capacity", files)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	return analysisUsecase.NewExportSource(service), created.ID
}

func TestExportSource_Bundle_IsTheParsedSeriesTheChartsDraw(t *testing.T) {
	source, analysisID := newExportSource(t, []analysisDomain.SourceFile{{Name: "cpu.rrd"}})

	bundle, err := source.Bundle(context.Background(), analysisID)
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}

	if len(bundle.Series) != 1 || bundle.Series[0].ID != "s0" || bundle.Series[0].Label != "cpu" {
		t.Errorf("series = %+v, want the one cpu series as s0", bundle.Series)
	}
}

func TestExportSource_Windows_AverageTheSeriesOverTheGrid(t *testing.T) {
	source, analysisID := newExportSource(t, []analysisDomain.SourceFile{{Name: "cpu.rrd"}})
	grid := exportDomain.Grid{UntilMilliseconds: 2 * fiveMinutesInMilliseconds, Columns: 2}

	windows, err := source.Windows(context.Background(), analysisID, []string{"s0"}, grid)
	if err != nil {
		t.Fatalf("windows: %v", err)
	}

	want := []seriesDomain.Sample{seriesDomain.Known(10), seriesDomain.Known(30)}
	if len(windows) != 1 || windows[0].SeriesID != "s0" || !reflect.DeepEqual(windows[0].Samples, want) {
		t.Errorf("windows = %+v, want s0 averaged into %v", windows, want)
	}
}

func TestExportSource_Sources_NameTheAnalysisAndTheFilesItWasCreatedFrom(t *testing.T) {
	source, analysisID := newExportSource(t, []analysisDomain.SourceFile{
		{Name: "cpu.rrd", Path: "/data/cpu.rrd", Size: 1},
		{Name: "picked-in-a-browser.rrd", Size: 2},
	})

	sources, err := source.Sources(context.Background(), analysisID)
	if err != nil {
		t.Fatalf("sources: %v", err)
	}

	want := exportDomain.SourceSet{AnalysisName: "Capacity", Files: []exportDomain.SourceFile{
		{Name: "cpu.rrd", Path: "/data/cpu.rrd"},
		{Name: "picked-in-a-browser.rrd"},
	}}
	if !reflect.DeepEqual(sources, want) {
		t.Errorf("sources = %+v, want %+v", sources, want)
	}
}

func TestExportSource_Sources_OfAnAnalysisTheLibraryDoesNotHold_IsReportedAsNotFound(t *testing.T) {
	source, _ := newExportSource(t, []analysisDomain.SourceFile{{Name: "cpu.rrd"}})

	if _, err := source.Sources(context.Background(), "missing"); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}
