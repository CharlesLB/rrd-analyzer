package surface_test

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
)

var pngSignature = []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

// savePicker stands in for the native save dialog: it answers with a fixed target and remembers
// the names it was offered.
type savePicker struct {
	target    string
	suggested []string
}

func (picker *savePicker) PickSources(context.Context) ([]surface.FileInfo, error) {
	return nil, nil
}

func (picker *savePicker) PickSaveTarget(_ context.Context, suggestedName string) (string, error) {
	picker.suggested = append(picker.suggested, suggestedName)

	return picker.target, nil
}

func openSearchHistory(t *testing.T, directory string) *searchesInfra.Store {
	t.Helper()

	searchHistory, err := searchesInfra.OpenStore(context.Background(), filepath.Join(directory, "analyses.db"))
	if err != nil {
		t.Fatalf("open search history: %v", err)
	}
	t.Cleanup(func() { _ = searchHistory.Close() })

	return searchHistory
}

func newOperations(t *testing.T, picker *savePicker) *surface.Operations {
	t.Helper()

	directory := t.TempDir()
	store, err := analysisInfra.OpenStore(context.Background(), filepath.Join(directory, "analyses.db"), filepath.Join(directory, "analyses.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	return surface.Build(surface.Wiring{
		Store:                  store,
		SearchHistory:          openSearchHistory(t, directory),
		Files:                  surface.DiskSourceFiles(),
		ConfigurationDirectory: directory,
		Picker:                 picker,
		SaveTargets:            picker,
		Writer:                 exportInfra.NewFileWriter(),
	})
}

func TestDescribeSourcesDescribesADroppedFolderAsTheSourcesInsideIt(t *testing.T) {
	folder := t.TempDir()
	if err := os.WriteFile(filepath.Join(folder, "cpu.rrd"), []byte("RRD"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	described, err := newOperations(t, &savePicker{}).DescribeSources(context.Background(), []string{folder})
	if err != nil {
		t.Fatalf("describe: %v", err)
	}

	want := []surface.FileInfo{{Name: "cpu.rrd", Path: filepath.Join(folder, "cpu.rrd"), Size: 3}}
	if !reflect.DeepEqual(described, want) {
		t.Fatalf("described = %+v, want %+v", described, want)
	}
}

func TestExportImageWritesTheBytesWhereTheSaveDialogPoints(t *testing.T) {
	target := filepath.Join(t.TempDir(), "chosen.png")
	operations := newOperations(t, &savePicker{target: target})

	path, err := operations.ExportImage(context.Background(), "rrd_atlas-system-cpu-user_202608281500_202608291500.png", pngSignature)
	if err != nil {
		t.Fatalf("export image: %v", err)
	}

	written, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read export: %v", err)
	}
	if path != target || !bytes.Equal(written, pngSignature) {
		t.Fatalf("wrote %d bytes to %q, want the png signature at %q", len(written), path, target)
	}
}

func TestExportImageOffersTheSaveDialogTheBaseOfTheSuggestedNameOnly(t *testing.T) {
	picker := &savePicker{target: filepath.Join(t.TempDir(), "chosen.png")}
	operations := newOperations(t, picker)

	if _, err := operations.ExportImage(context.Background(), "../../outside/rrd_202608281500_202608291500.png", pngSignature); err != nil {
		t.Fatalf("export image: %v", err)
	}

	if len(picker.suggested) != 1 || picker.suggested[0] != "rrd_202608281500_202608291500.png" {
		t.Fatalf("dialog was offered %q, want only the base name", picker.suggested)
	}
}

func TestExportImageWritesNothingWhenTheSaveDialogIsCancelled(t *testing.T) {
	operations := newOperations(t, &savePicker{target: ""})

	path, err := operations.ExportImage(context.Background(), "rrd_202608281500_202608291500.png", pngSignature)

	if err != nil || path != "" {
		t.Fatalf("path, err = %q, %v, want an empty path and no error", path, err)
	}
}

func TestExportImageRefusesAnEmptyImageWithoutOpeningTheSaveDialog(t *testing.T) {
	picker := &savePicker{target: filepath.Join(t.TempDir(), "chosen.png")}
	operations := newOperations(t, picker)

	_, err := operations.ExportImage(context.Background(), "rrd_202608281500_202608291500.png", nil)

	if !errors.Is(err, exportDomain.ErrNothingToExport) || len(picker.suggested) != 0 {
		t.Fatalf("err = %v after %d dialogs, want %v before any dialog", err, len(picker.suggested), exportDomain.ErrNothingToExport)
	}
}

const oneSourceDump = `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
	`<ds><name>value</name><type>GAUGE</type></ds>` +
	`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
	`<row><v>1.0e+00</v></row><row><v>2.0e+00</v></row><row><v>3.0e+00</v></row>` +
	`</database></rra></rrd>`

// twelveRowDump holds an hour of five-minute rows reading 1 to 12.
const twelveRowDump = `<rrd><version>0003</version><step>300</step><lastupdate>3600</lastupdate>` +
	`<ds><name>value</name><type>GAUGE</type></ds>` +
	`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
	`<row><v>1</v></row><row><v>2</v></row><row><v>3</v></row><row><v>4</v></row>` +
	`<row><v>5</v></row><row><v>6</v></row><row><v>7</v></row><row><v>8</v></row>` +
	`<row><v>9</v></row><row><v>10</v></row><row><v>11</v></row><row><v>12</v></row>` +
	`</database></rra></rrd>`

func TestEncodeCSVExportOfAWindowOffTheStepGridWritesOnlyReadingsTheFileStores(t *testing.T) {
	source := filepath.Join(t.TempDir(), "cpu.xml")
	if err := os.WriteFile(source, []byte(twelveRowDump), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	operations := newOperations(t, &savePicker{})
	created, err := operations.CreateAnalysis(context.Background(), "Capacity", []surface.FileInfo{{Name: "cpu.xml", Path: source, Size: int64(len(twelveRowDump))}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	document, err := operations.EncodeCSVExport(context.Background(), surface.ExportRequest{
		AnalysisID: created.ID, SeriesIDs: []string{"s0"}, FromMilliseconds: 150000, UntilMilliseconds: 3450000,
	})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	stored := map[string]bool{}
	for reading := 1; reading <= 12; reading++ {
		stored[strconv.Itoa(reading)+".0000"] = true
	}
	lines := strings.Split(strings.TrimSuffix(string(document.Content), "\n"), "\n")
	for _, line := range lines[1:] {
		reading := line[strings.LastIndex(line, ",")+1:]
		if !stored[reading] {
			t.Fatalf("row %q reads %q, a blend of two stored readings; want only the readings 1 to 12", line, reading)
		}
	}
	if !strings.HasPrefix(lines[1], "1970-01-01T00:00:") {
		t.Errorf("first row %q, want the row laid on the step that holds the window's start", lines[1])
	}
}

func TestExportCSVWritesTheDocumentEncodeCSVExportComposes(t *testing.T) {
	source := filepath.Join(t.TempDir(), "cpu.xml")
	if err := os.WriteFile(source, []byte(oneSourceDump), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	target := filepath.Join(t.TempDir(), "chosen.csv")
	picker := &savePicker{target: target}
	operations := newOperations(t, picker)

	created, err := operations.CreateAnalysis(context.Background(), "Capacity", []surface.FileInfo{{Name: "cpu.xml", Path: source, Size: int64(len(oneSourceDump))}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	request := surface.ExportRequest{AnalysisID: created.ID, SeriesIDs: []string{"s0"}, FromMilliseconds: 0, UntilMilliseconds: 900000}

	document, err := operations.EncodeCSVExport(context.Background(), request)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	if _, err := operations.ExportCSV(context.Background(), request); err != nil {
		t.Fatalf("export: %v", err)
	}

	written, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read export: %v", err)
	}

	if !bytes.Equal(written, document.Content) || len(picker.suggested) != 1 || picker.suggested[0] != document.FileName {
		t.Fatalf("wrote %q offered as %q, want %q offered as %q", written, picker.suggested, document.Content, document.FileName)
	}
}

func TestEncodeCSVExportWritesOneRowPerFinestStepUnderAUnitHeader(t *testing.T) {
	source := filepath.Join(t.TempDir(), "cpu.xml")
	if err := os.WriteFile(source, []byte(oneSourceDump), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	operations := newOperations(t, &savePicker{})
	created, err := operations.CreateAnalysis(context.Background(), "Capacity", []surface.FileInfo{{Name: "cpu.xml", Path: source, Size: int64(len(oneSourceDump))}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	document, err := operations.EncodeCSVExport(context.Background(), surface.ExportRequest{
		AnalysisID: created.ID, SeriesIDs: []string{"s0"}, FromMilliseconds: 0, UntilMilliseconds: 900000,
	})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	lines := strings.Split(strings.TrimSuffix(string(document.Content), "\n"), "\n")
	if !strings.HasPrefix(lines[0], "timestamp,") || !strings.HasSuffix(lines[0], "]") {
		t.Errorf("header = %q, want the timestamp then a series named with its unit", lines[0])
	}

	if document.SampleCount != 60 || len(lines) != 61 || document.SeriesCount != 1 {
		t.Errorf("%d samples in %d lines of %d series, want the 60-row floor under one header", document.SampleCount, len(lines), document.SeriesCount)
	}
}

func TestEncodeCSVExportRefusesAWindowWithNoSeries(t *testing.T) {
	source := filepath.Join(t.TempDir(), "cpu.xml")
	if err := os.WriteFile(source, []byte(oneSourceDump), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	operations := newOperations(t, &savePicker{})
	created, err := operations.CreateAnalysis(context.Background(), "Capacity", []surface.FileInfo{{Name: "cpu.xml", Path: source, Size: int64(len(oneSourceDump))}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	_, err = operations.EncodeCSVExport(context.Background(), surface.ExportRequest{AnalysisID: created.ID, UntilMilliseconds: 900000})

	if !errors.Is(err, exportDomain.ErrNothingToExport) {
		t.Fatalf("err = %v, want %v", err, exportDomain.ErrNothingToExport)
	}
}

const builtDump = `<rrd><step>300</step><lastupdate>1788026400</lastupdate>
<ds><name>value</name><type>GAUGE</type><max>NaN</max></ds>
<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database><row><v>1</v></row><row><v>2</v></row></database></rra></rrd>`

// Both binaries get their services from Build, so what Build leaves out of one is missing from the
// window and the development server alike. These are the two options a hand-wired graph dropped.
func TestBuild_WiresTheConfiguredUnitsAndTheLookForMissingSourcesIntoTheAnalyses(t *testing.T) {
	directory := t.TempDir()
	store, err := analysisInfra.OpenStore(context.Background(), filepath.Join(directory, "analyses.db"), "")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	source := filepath.Join(directory, "queue_depth.xml")
	if err := os.WriteFile(source, []byte(builtDump), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	units := "[[unit]]\nseries = \"queue_*\"\nunit = \"jobs\"\n"
	if err := os.WriteFile(filepath.Join(directory, analysisInfra.UnitsFileName), []byte(units), 0o600); err != nil {
		t.Fatalf("write units: %v", err)
	}

	picker := &savePicker{}
	operations := surface.Build(surface.Wiring{
		Store:                  store,
		SearchHistory:          openSearchHistory(t, directory),
		Files:                  surface.DiskSourceFiles(),
		ConfigurationDirectory: directory,
		Picker:                 picker,
		SaveTargets:            picker,
		Writer:                 exportInfra.NewFileWriter(),
	})

	created, err := operations.CreateAnalysis(context.Background(), "Queues", []surface.FileInfo{{Name: "queue_depth.xml", Path: source}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	bundle, err := operations.OpenAnalysis(context.Background(), created.ID)
	if err != nil || len(bundle.Series) != 1 || bundle.Series[0].Unit != "jobs" {
		t.Fatalf("opened %+v, %v; want the one series in the unit units.toml gives it", bundle.Series, err)
	}

	if err := os.Remove(source); err != nil {
		t.Fatalf("remove source: %v", err)
	}

	missing, err := operations.MissingSources(context.Background(), created.ID)
	if err != nil || len(missing) != 1 || missing[0].Path != source {
		t.Fatalf("missing = %+v, %v; want the removed source named", missing, err)
	}
}
