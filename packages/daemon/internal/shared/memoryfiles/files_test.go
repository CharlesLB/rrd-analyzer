package memoryfiles_test

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/memoryfiles"
)

func TestFilesReadBackWhatWasKept(t *testing.T) {
	files := memoryfiles.New()
	path := files.Keep("cpu.rrd", []byte("content"))

	content, err := files.Read(context.Background(), path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if string(content) != "content" {
		t.Fatalf("want the kept content, got %q", content)
	}
}

func TestFilesKeepACopySoTheCallerMayReuseItsBuffer(t *testing.T) {
	files := memoryfiles.New()
	buffer := []byte("first")
	path := files.Keep("cpu.rrd", buffer)

	copy(buffer, "xxxxx")

	content, err := files.Read(context.Background(), path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if !bytes.Equal(content, []byte("first")) {
		t.Fatalf("want the content as it was kept, got %q", content)
	}
}

func TestFilesGiveTwoFilesOfTheSameNameTwoPaths(t *testing.T) {
	files := memoryfiles.New()

	first := files.Keep("cpu.rrd", []byte("one"))
	second := files.Keep("cpu.rrd", []byte("two"))

	if first == second {
		t.Fatalf("want two paths, got %q twice", first)
	}

	if !strings.HasSuffix(first, "/cpu.rrd") || !strings.HasPrefix(first, "memory:/") {
		t.Fatalf("want a memory path ending in the file name, got %q", first)
	}
}

func TestFilesSayWhatTheyDoNotHold(t *testing.T) {
	files := memoryfiles.New()

	exists, err := files.Exists(context.Background(), "memory:/1/gone.rrd")
	if err != nil || exists {
		t.Fatalf("want absent without error, got %v %v", exists, err)
	}

	_, err = files.Read(context.Background(), "memory:/1/gone.rrd")
	if !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("want fs.ErrNotExist, got %v", err)
	}
}

func TestFilesReadNothingOnceTheCallerHasGone(t *testing.T) {
	files := memoryfiles.New()
	path := files.Keep("cpu.rrd", []byte("content"))
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := files.Read(cancelled, path); !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}

	if _, err := files.Exists(cancelled, path); !errors.Is(err, context.Canceled) {
		t.Fatalf("want context.Canceled, got %v", err)
	}
}

func TestFilesForgetWhatTheyWereToldToLetGoOf(t *testing.T) {
	files := memoryfiles.New()
	forgotten := files.Keep("cpu.rrd", []byte("one"))
	kept := files.Keep("memory.rrd", []byte("two"))

	files.Forget(forgotten)
	files.Forget(forgotten)

	if exists, _ := files.Exists(context.Background(), forgotten); exists {
		t.Errorf("Exists(%q) = true after Forget, want false", forgotten)
	}

	if exists, _ := files.Exists(context.Background(), kept); !exists {
		t.Errorf("Exists(%q) = false, want the other file still kept", kept)
	}
}
