package infrastructure_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
)

func TestFileReaderReadsTheSourceWhole(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cpu.rrd")
	if err := os.WriteFile(path, []byte("RRD\x00content"), 0o600); err != nil {
		t.Fatalf("write the source: %v", err)
	}

	content, err := exportInfra.NewFileReader().Read(context.Background(), path)
	if err != nil || string(content) != "RRD\x00content" {
		t.Fatalf("read = %q, %v; want the source's bytes", content, err)
	}
}

func TestFileReaderReportsASourceNoLongerOnDiskAsUnreadable(t *testing.T) {
	_, err := exportInfra.NewFileReader().Read(context.Background(), filepath.Join(t.TempDir(), "moved.rrd"))

	if !errors.Is(err, exportDomain.ErrSourceUnreadable) || !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("err = %v, want %v wrapping %v", err, exportDomain.ErrSourceUnreadable, os.ErrNotExist)
	}
}
