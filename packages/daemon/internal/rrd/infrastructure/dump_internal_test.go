package infrastructure

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
)

const (
	hangingToolTimeout = 50 * time.Millisecond
	hangingToolBound   = 5 * time.Second
)

func TestDumpReaderStopsAnRRDToolThatOutlivesItsTimeout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the stand-in rrdtool is a shell script")
	}

	directory := t.TempDir()
	tool := filepath.Join(directory, dumpToolName)

	if err := os.WriteFile(tool, []byte("#!/bin/sh\nexec sleep 30\n"), 0o700); err != nil {
		t.Fatalf("write stand-in tool: %v", err)
	}

	source := filepath.Join(directory, "unreadable.rrd")
	if err := os.WriteFile(source, []byte("RRD\x00a layout this build does not read in place"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	reader := &DumpReader{contents: diskContents{}, toolPath: tool, timeout: hangingToolTimeout, withoutTool: rrdDomain.ErrDumpToolMissing}
	started := time.Now()

	_, err := reader.ReadDump(context.Background(), source)

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want context.DeadlineExceeded, got %v", err)
	}

	if elapsed := time.Since(started); elapsed > hangingToolBound {
		t.Fatalf("dump returned after %v, want well under %v", elapsed, hangingToolBound)
	}
}

func TestDumpReaderReadsNothingOnceTheCallerHasGone(t *testing.T) {
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := NewDumpReader().ReadDump(cancelled, filepath.Join(t.TempDir(), "missing.rrd"))

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
}

func TestDumpReaderMissingSourceReportsBothUnreadableAndWhyTheSystemRefused(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "gone.rrd")

	_, err := NewDumpReader().ReadDump(context.Background(), missing)

	if !errors.Is(err, rrdDomain.ErrUnreadableSource) || !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("err = %v, want both %v and %v", err, rrdDomain.ErrUnreadableSource, fs.ErrNotExist)
	}
}

func TestDumpReaderHandsRRDToolThePathAfterTheEndOfItsOptions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the stand-in rrdtool is a shell script")
	}

	directory := t.TempDir()
	tool := filepath.Join(directory, dumpToolName)

	if err := os.WriteFile(tool, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\"\n"), 0o700); err != nil {
		t.Fatalf("write stand-in tool: %v", err)
	}

	source := filepath.Join(directory, "-h.rrd")
	if err := os.WriteFile(source, []byte("RRD\x00a layout this build does not read in place"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	reader := &DumpReader{contents: diskContents{}, toolPath: tool, timeout: hangingToolBound, withoutTool: rrdDomain.ErrDumpToolMissing}

	arguments, err := reader.ReadDump(context.Background(), source)
	if err != nil {
		t.Fatalf("read dump: %v", err)
	}

	if want := "dump\n--\n" + source + "\n"; string(arguments) != want {
		t.Errorf("rrdtool was run with %q, want %q so a path can never be read as an option", arguments, want)
	}
}
