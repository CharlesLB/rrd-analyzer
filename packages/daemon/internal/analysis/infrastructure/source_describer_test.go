package infrastructure_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

func writeSource(t *testing.T, content string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "cpu.rrd")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	return path
}

func TestSourceDescriberReadsTheNameAndSizeOfEachPath(t *testing.T) {
	path := writeSource(t, "RRD dump")

	described, err := analysisInfra.NewSourceDescriber().Describe(context.Background(), []string{path})
	if err != nil {
		t.Fatalf("describe: %v", err)
	}

	if len(described) != 1 || described[0].Name != "cpu.rrd" || described[0].Size != int64(len("RRD dump")) {
		t.Fatalf("described = %+v, want cpu.rrd of 8 bytes", described)
	}
}

func TestSourceDescriberTakesADroppedFolderForTheSourcesDirectlyInsideIt(t *testing.T) {
	folder := t.TempDir()
	for name, content := range map[string]string{"cpu.rrd": "RRD", "load.XML": "dump", "notes.txt": "no"} {
		if err := os.WriteFile(filepath.Join(folder, name), []byte(content), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if err := os.Mkdir(filepath.Join(folder, "older"), 0o700); err != nil {
		t.Fatalf("make subfolder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(folder, "older", "disk.rrd"), []byte("RRD"), 0o600); err != nil {
		t.Fatalf("write nested source: %v", err)
	}

	described, err := analysisInfra.NewSourceDescriber().Describe(context.Background(), []string{folder})
	if err != nil {
		t.Fatalf("describe: %v", err)
	}

	want := []analysisDomain.SourceFile{
		{Name: "cpu.rrd", Path: filepath.Join(folder, "cpu.rrd"), Size: 3},
		{Name: "load.XML", Path: filepath.Join(folder, "load.XML"), Size: 4},
	}
	if !reflect.DeepEqual(described, want) {
		t.Fatalf("described = %+v, want %+v", described, want)
	}
}

func TestSourceDescriberRefusesAPathThatIsNeitherAFileNorAFolder(t *testing.T) {
	if _, err := os.Stat("/dev/null"); err != nil {
		t.Skip("no /dev/null on this system")
	}

	_, err := analysisInfra.NewSourceDescriber().Describe(context.Background(), []string{"/dev/null"})

	if err == nil {
		t.Fatal("want an error for a device, got none")
	}
}

func TestSourceDescriberStopsOnceTheCallerHasGone(t *testing.T) {
	path := writeSource(t, "RRD dump")
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := analysisInfra.NewSourceDescriber().Describe(cancelled, []string{path})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
}
