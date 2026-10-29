package sqlitedb_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/sqlitedb"
)

const (
	foreignKeysEnforced = 1
	journalModeWAL      = "wal"
	singleConnection    = 1
	ownerOnlyMode       = 0o600
	notesSchema         = `CREATE TABLE IF NOT EXISTS notes (text TEXT NOT NULL);`
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

func TestOpenWithSchema_AFreshFile_HoldsTheTablesTheSchemaCreates(t *testing.T) {
	path := filepath.Join(t.TempDir(), "analyses.db")

	handle, err := sqlitedb.OpenWithSchema(context.Background(), path, notesSchema)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	t.Cleanup(func() { _ = handle.Close() })

	if _, err := handle.ExecContext(context.Background(), "INSERT INTO notes (text) VALUES ('kept')"); err != nil {
		t.Errorf("insert into the table the schema created: %v", err)
	}
}

func TestOpenWithSchema_APlaceThatCannotHoldTheTables_IsRefused(t *testing.T) {
	notADatabase := filepath.Join(t.TempDir(), "analyses.db")
	if err := os.WriteFile(notADatabase, []byte(strings.Repeat("not a database ", 100)), ownerOnlyMode); err != nil {
		t.Fatalf("write the file: %v", err)
	}

	tests := []struct {
		name        string
		givePath    string
		wantMessage string
	}{
		{name: "a path the connector cannot parse", givePath: filepath.Join(t.TempDir(), "analyses?%zz"), wantMessage: "open database"},
		{name: "a file that is not a database", givePath: notADatabase, wantMessage: "prepare database"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := sqlitedb.OpenWithSchema(context.Background(), tt.givePath, notesSchema)

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("err = %v, want one saying %q", err, tt.wantMessage)
			}
		})
	}
}
