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

func TestSourceDescriber_APathNothingIsAt_IsRefused(t *testing.T) {
	gone := filepath.Join(t.TempDir(), "moved.rrd")

	if _, err := analysisInfra.NewSourceDescriber().Describe(context.Background(), []string{gone}); err == nil {
		t.Fatal("want an error for a path nothing is at, got none")
	}
}

const (
	listableFolderMode = 0o700

	// A folder that can be searched but not read cannot be listed, and one that can be read but
	// not searched lists its names while every file in it stays out of reach.
	unlistableFolderMode   = 0o300
	unsearchableFolderMode = 0o400
)

func TestSourceDescriber_ADroppedFolderItCannotRead_IsRefused(t *testing.T) {
	tests := []struct {
		name     string
		giveMode os.FileMode
	}{
		{name: "a folder that cannot be listed", giveMode: unlistableFolderMode},
		{name: "a folder whose files cannot be looked at", giveMode: unsearchableFolderMode},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			folder := filepath.Dir(writeSource(t, "RRD dump"))
			if err := os.Chmod(folder, tt.giveMode); err != nil {
				t.Fatalf("restrict the folder: %v", err)
			}

			t.Cleanup(func() { _ = os.Chmod(folder, listableFolderMode) })

			if _, err := analysisInfra.NewSourceDescriber().Describe(context.Background(), []string{folder}); err == nil {
				t.Fatal("want an error for a folder that cannot be read, got none")
			}
		})
	}
}
