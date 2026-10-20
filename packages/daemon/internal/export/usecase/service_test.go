package usecase_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// recordingSource serves one bundle, answers every window read with a known reading per column,
// and remembers the grids it was asked for.
type recordingSource struct {
	bundle seriesDomain.Bundle
	grids  []exportDomain.Grid
}

func (source *recordingSource) Bundle(context.Context, string) (seriesDomain.Bundle, error) {
	return source.bundle, nil
}

func (source *recordingSource) Windows(_ context.Context, _ string, seriesIDs []string, grid exportDomain.Grid) ([]seriesDomain.Window, error) {
	source.grids = append(source.grids, grid)

	windows := make([]seriesDomain.Window, 0, len(seriesIDs))
	for _, seriesID := range seriesIDs {
		windows = append(windows, seriesDomain.Window{SeriesID: seriesID, Samples: slices.Repeat([]seriesDomain.Sample{seriesDomain.Known(1)}, grid.Columns)})
	}

	return windows, nil
}

func TestServiceEncodeCSVReadsTheExportGridAndNamesTheFileAfterTheWindowAskedFor(t *testing.T) {
	source := &recordingSource{bundle: bundleOf(seriesDomain.Series{ID: "s0", Name: "host_cpu", Unit: "%", StepMilliseconds: minute})}
	request := exportDomain.CSVRequest{AnalysisID: "capacity", SeriesIDs: []string{"s0"}, FromMilliseconds: 30 * second, UntilMilliseconds: hour - 30*second}

	document, err := newService(source).EncodeCSV(context.Background(), request)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	wantGrid := exportUsecase.ExportGrid(source.bundle.Series, request.FromMilliseconds, request.UntilMilliseconds)
	if len(source.grids) != 1 || source.grids[0] != wantGrid {
		t.Fatalf("windows read on %+v, want once on the export grid %+v", source.grids, wantGrid)
	}

	if want := exportUsecase.CSVFileName([]string{"host_cpu"}, request.FromMilliseconds, request.UntilMilliseconds); document.FileName != want {
		t.Errorf("file name = %q, want %q", document.FileName, want)
	}

	if document.SampleCount != wantGrid.Columns || document.SeriesCount != 1 || !strings.HasPrefix(string(document.Content), "timestamp,host_cpu [%]\n") {
		t.Errorf("%d samples of %d series in %q, want %d samples of one", document.SampleCount, document.SeriesCount, document.Content, wantGrid.Columns)
	}
}

func TestServiceEncodeCSVLaysTheGridAtTheStepOfTheSeriesExportedNotOfAFinerOneLeftOut(t *testing.T) {
	source := &recordingSource{bundle: bundleOf(
		seriesDomain.Series{ID: "s0", Name: "host_cpu", StepMilliseconds: second},
		seriesDomain.Series{ID: "s1", Name: "host_load", StepMilliseconds: fiveMinutes},
	)}
	request := exportDomain.CSVRequest{AnalysisID: "capacity", SeriesIDs: []string{"s1"}, UntilMilliseconds: 24 * hour}

	if _, err := newService(source).EncodeCSV(context.Background(), request); err != nil {
		t.Fatalf("encode: %v", err)
	}

	want := exportDomain.Grid{UntilMilliseconds: 24 * hour, Columns: 288}
	if len(source.grids) != 1 || source.grids[0] != want {
		t.Fatalf("windows read on %+v, want one row to each five minutes: %+v", source.grids, want)
	}
}

func TestServiceEncodeCSVRefusesAnExportOfNoSeriesBeforeReadingAnyWindow(t *testing.T) {
	source := &recordingSource{bundle: bundleOf(seriesDomain.Series{ID: "s0", StepMilliseconds: minute})}

	_, err := newService(source).EncodeCSV(context.Background(), exportDomain.CSVRequest{AnalysisID: "capacity", UntilMilliseconds: hour})

	if !errors.Is(err, exportDomain.ErrNothingToExport) || len(source.grids) != 0 {
		t.Fatalf("err = %v after %d window reads, want %v before any", err, len(source.grids), exportDomain.ErrNothingToExport)
	}
}

// newService wires an export over a stubbed library. Encoding never reaches the save dialog, so
// the picker and the writer only have to be present.
func newService(source exportDomain.SeriesSource) *exportUsecase.Service {
	return exportUsecase.NewService(exportUsecase.Dependencies{Source: source, Library: noSources{}, Reader: noSources{}, Format: noSources{}, Picker: refusedSave{}, Writer: refusedSave{}})
}

type noSources struct{}

func (noSources) Sources(context.Context, string) (exportDomain.SourceSet, error) {
	return exportDomain.SourceSet{}, errors.New("this test never copies sources")
}

func (noSources) Recognises([]byte) bool { return true }

func (noSources) Read(context.Context, string) ([]byte, error) {
	return nil, errors.New("this test never copies sources")
}

type refusedSave struct{}

func (refusedSave) PickSaveTarget(context.Context, string) (string, error) {
	return "", errors.New("this test never saves")
}

func (refusedSave) Write(context.Context, string, []byte) error {
	return errors.New("this test never saves")
}
