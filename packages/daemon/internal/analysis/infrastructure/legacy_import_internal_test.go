//go:build !js

package infrastructure

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

// Reading the library version is the one statement of opening a store that nothing reaches from
// outside: every statement before it reads the same file the same way, so a database that lets those
// through lets this one through too, and only a caller giving up in between stops it.
func TestImportLegacy_ACallerThatHasGone_ReportsTheLibraryVersionUnread(t *testing.T) {
	directory := t.TempDir()

	store, err := OpenStore(context.Background(), filepath.Join(directory, "analyses.db"), "")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	t.Cleanup(func() { _ = store.Close() })

	gone, leave := context.WithCancel(context.Background())
	leave()

	err = store.importLegacy(gone, filepath.Join(directory, "analyses.json"))

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want %v", err, context.Canceled)
	}
}
