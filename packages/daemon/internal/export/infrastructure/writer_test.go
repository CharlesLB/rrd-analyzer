package infrastructure_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
)

func TestFileWriterWritesTheExportWhereItIsTold(t *testing.T) {
	path := filepath.Join(t.TempDir(), "export.csv")

	if err := exportInfra.NewFileWriter().Write(context.Background(), path, []byte("time,value\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	written, err := os.ReadFile(path)
	if err != nil || string(written) != "time,value\n" {
		t.Fatalf("written = %q, %v; want the export", written, err)
	}
}

func TestFileWriterWritesNothingOnceTheCallerHasGone(t *testing.T) {
	path := filepath.Join(t.TempDir(), "export.csv")
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	err := exportInfra.NewFileWriter().Write(cancelled, path, []byte("time,value\n"))

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}

	if _, statErr := os.Stat(path); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("stat = %v, want no file", statErr)
	}
}

func TestFileWriterReportsAFolderThatIsNotThere(t *testing.T) {
	path := filepath.Join(t.TempDir(), "removed", "export.csv")

	err := exportInfra.NewFileWriter().Write(context.Background(), path, []byte("time,value\n"))

	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("err = %v, want %v", err, os.ErrNotExist)
	}
}
