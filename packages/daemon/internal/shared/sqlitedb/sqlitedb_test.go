package sqlitedb_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/sqlitedb"
)

const (
	foreignKeysEnforced = 1
	journalModeWAL      = "wal"
	singleConnection    = 1
)

func TestOpenHandsBackOneConnectionThatEnforcesForeignKeysInWALMode(t *testing.T) {
	handle, err := sqlitedb.Open(filepath.Join(t.TempDir(), "analyses.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	t.Cleanup(func() { _ = handle.Close() })

	var foreignKeys int
	if err := handle.QueryRowContext(context.Background(), "PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
		t.Fatalf("read foreign_keys: %v", err)
	}

	var journalMode string
	if err := handle.QueryRowContext(context.Background(), "PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatalf("read journal_mode: %v", err)
	}

	if foreignKeys != foreignKeysEnforced || journalMode != journalModeWAL {
		t.Errorf("foreign_keys = %d, journal_mode = %q; want %d, %q", foreignKeys, journalMode, foreignKeysEnforced, journalModeWAL)
	}

	if got := handle.Stats().MaxOpenConnections; got != singleConnection {
		t.Errorf("max open connections = %d, want %d", got, singleConnection)
	}
}

func TestOpenRefusesAPathWhoseQueryStringDoesNotParse(t *testing.T) {
	handle, err := sqlitedb.Open(filepath.Join(t.TempDir(), "analyses?%zz"))

	if err == nil {
		_ = handle.Close()
		t.Fatal("opened a path whose query string does not parse, want it refused")
	}
}
