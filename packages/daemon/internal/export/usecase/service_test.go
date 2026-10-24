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

var (
	errSourceUnavailable = errors.New("the analysis library is unavailable")
	errDiskFull          = errors.New("no space left on the device")
)

// brokenSource fails the read it is told to, and reads every window as no window at all.
type brokenSource struct {
	bundleErr  error
	windowsErr error
}

func (source brokenSource) Bundle(context.Context, string) (seriesDomain.Bundle, error) {
	return bundleOf(seriesDomain.Series{ID: "s0", Name: "host_cpu", StepMilliseconds: minute}), source.bundleErr
}

func (source brokenSource) Windows(context.Context, string, []string, exportDomain.Grid) ([]seriesDomain.Window, error) {
	return nil, source.windowsErr
}

// fullDisk points the save dialog at a file it then cannot write.
type fullDisk struct{}

func (fullDisk) PickSaveTarget(context.Context, string) (string, error) {
	return "/exports/full.csv", nil
}

func (fullDisk) Write(context.Context, string, []byte) error {
	return errDiskFull
}

// newSavingService wires an export whose save dialog and writer are the shelf.
func newSavingService(source exportDomain.SeriesSource, shelf *sourceShelf) *exportUsecase.Service {
	return exportUsecase.NewService(exportUsecase.Dependencies{Source: source, Library: shelf, Reader: shelf, Format: shelf, Picker: shelf, Writer: shelf})
}

func TestNewService_MissingDependency_PanicsNamingTheWire(t *testing.T) {
	tests := []struct {
		name        string
		giveUnwired func(dependencies *exportUsecase.Dependencies)
		want        string
	}{
		{name: "series source", giveUnwired: func(dependencies *exportUsecase.Dependencies) { dependencies.Source = nil }, want: "series source"},
		{name: "source library", giveUnwired: func(dependencies *exportUsecase.Dependencies) { dependencies.Library = nil }, want: "source library"},
		{name: "source reader", giveUnwired: func(dependencies *exportUsecase.Dependencies) { dependencies.Reader = nil }, want: "source reader"},
		{name: "source format", giveUnwired: func(dependencies *exportUsecase.Dependencies) { dependencies.Format = nil }, want: "source format"},
		{name: "save target picker", giveUnwired: func(dependencies *exportUsecase.Dependencies) { dependencies.Picker = nil }, want: "save target picker"},
		{name: "writer", giveUnwired: func(dependencies *exportUsecase.Dependencies) { dependencies.Writer = nil }, want: "writer"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shelf := &sourceShelf{}
			dependencies := exportUsecase.Dependencies{Source: &recordingSource{}, Library: shelf, Reader: shelf, Format: shelf, Picker: shelf, Writer: shelf}
			tt.giveUnwired(&dependencies)

			defer func() {
				recovered := recover()
				if message, isText := recovered.(string); !isText || !strings.Contains(message, tt.want) {
					t.Errorf("panic = %v, want a message naming the %s", recovered, tt.want)
				}
			}()

			exportUsecase.NewService(dependencies)
		})
	}
}

func TestServiceEncodeCSVFails(t *testing.T) {
	tests := []struct {
		name       string
		giveSource brokenSource
		wantErr    error
	}{
		{name: "the bundle cannot be read", giveSource: brokenSource{bundleErr: errSourceUnavailable}, wantErr: errSourceUnavailable},
		{name: "the windows cannot be read", giveSource: brokenSource{windowsErr: errSourceUnavailable}, wantErr: errSourceUnavailable},
		{name: "no window to lay out", giveSource: brokenSource{}, wantErr: exportDomain.ErrNothingToExport},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := exportDomain.CSVRequest{AnalysisID: "capacity", SeriesIDs: []string{"s0"}, UntilMilliseconds: hour}

			_, err := newService(tt.giveSource).EncodeCSV(context.Background(), request)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestServiceSaveCSVWritesTheExportWhereTheSaveDialogPoints(t *testing.T) {
	source := &recordingSource{bundle: bundleOf(seriesDomain.Series{ID: "s0", Name: "host_cpu", Unit: "%", StepMilliseconds: minute})}
	shelf := &sourceShelf{target: "/exports/cpu.csv"}
	request := exportDomain.CSVRequest{AnalysisID: "capacity", SeriesIDs: []string{"s0"}, UntilMilliseconds: hour}

	saved, err := newSavingService(source, shelf).SaveCSV(context.Background(), request)
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	wantSuggested := exportUsecase.CSVFileName([]string{"host_cpu"}, request.FromMilliseconds, request.UntilMilliseconds)
	if !slices.Equal(shelf.suggested, []string{wantSuggested}) {
		t.Errorf("suggested %v, want the name of the window asked for", shelf.suggested)
	}

	if saved.Path != shelf.target || saved.SeriesCount != 1 || saved.SampleCount == 0 || !strings.HasPrefix(string(shelf.written[shelf.target]), "timestamp,host_cpu [%]\n") {
		t.Errorf("saved %+v, wrote %q; want the CSV at the picked target", saved, shelf.written[shelf.target])
	}
}

func TestServiceSaveCSVWritesNothingWhenTheSaveDialogIsCancelled(t *testing.T) {
	source := &recordingSource{bundle: bundleOf(seriesDomain.Series{ID: "s0", Name: "host_cpu", StepMilliseconds: minute})}
	shelf := &sourceShelf{}

	saved, err := newSavingService(source, shelf).SaveCSV(context.Background(), exportDomain.CSVRequest{AnalysisID: "capacity", SeriesIDs: []string{"s0"}, UntilMilliseconds: hour})

	if err != nil || saved != (exportDomain.SavedExport{}) || len(shelf.written) != 0 {
		t.Errorf("saved %+v, %v, wrote %d files; want nothing written", saved, err, len(shelf.written))
	}
}

func TestServiceSaveCSVFails(t *testing.T) {
	source := &recordingSource{bundle: bundleOf(seriesDomain.Series{ID: "s0", Name: "host_cpu", StepMilliseconds: minute})}

	tests := []struct {
		name        string
		giveRequest exportDomain.CSVRequest
		wantErr     error
	}{
		{name: "nothing to encode", giveRequest: exportDomain.CSVRequest{AnalysisID: "capacity", UntilMilliseconds: hour}, wantErr: exportDomain.ErrNothingToExport},
		{name: "the export cannot be written", giveRequest: exportDomain.CSVRequest{AnalysisID: "capacity", SeriesIDs: []string{"s0"}, UntilMilliseconds: hour}, wantErr: errDiskFull},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := exportUsecase.NewService(exportUsecase.Dependencies{Source: source, Library: noSources{}, Reader: noSources{}, Format: noSources{}, Picker: fullDisk{}, Writer: fullDisk{}})

			saved, err := service.SaveCSV(context.Background(), tt.giveRequest)

			if !errors.Is(err, tt.wantErr) || saved != (exportDomain.SavedExport{}) {
				t.Fatalf("saved %+v, err = %v; want nothing saved and %v", saved, err, tt.wantErr)
			}
		})
	}
}

func TestServiceSaveImageWritesTheImageUnderTheBaseOfTheSuggestedName(t *testing.T) {
	shelf := &sourceShelf{target: "/exports/chart.png"}

	path, err := newSavingService(&recordingSource{}, shelf).SaveImage(context.Background(), "../../home/dev/chart.png", []byte("PNG"))
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	if !slices.Equal(shelf.suggested, []string{"chart.png"}) {
		t.Errorf("suggested %v, want only the base of the name, never a folder", shelf.suggested)
	}

	if path != shelf.target || string(shelf.written[shelf.target]) != "PNG" {
		t.Errorf("saved at %q, wrote %q; want the image at the picked target", path, shelf.written[shelf.target])
	}
}

func TestServiceSaveImageFails(t *testing.T) {
	tests := []struct {
		name        string
		giveContent []byte
		wantErr     error
	}{
		{name: "an empty image", wantErr: exportDomain.ErrNothingToExport},
		{name: "the image cannot be written", giveContent: []byte("PNG"), wantErr: errDiskFull},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := exportUsecase.NewService(exportUsecase.Dependencies{Source: &recordingSource{}, Library: noSources{}, Reader: noSources{}, Format: noSources{}, Picker: fullDisk{}, Writer: fullDisk{}})

			path, err := service.SaveImage(context.Background(), "chart.png", tt.giveContent)

			if !errors.Is(err, tt.wantErr) || path != "" {
				t.Fatalf("path %q, err = %v; want no path and %v", path, err, tt.wantErr)
			}
		})
	}
}
