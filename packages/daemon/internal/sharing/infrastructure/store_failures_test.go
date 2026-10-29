//go:build !js

package infrastructure_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
)

const ownerOnlyMode = 0o600

// storeOnDisk opens a store on a fresh file and hands back where that file is, so a test can reach
// the same database through a connection of its own.
func storeOnDisk(t *testing.T) (*sharingInfra.Store, string) {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), databaseFileName)

	store, err := sharingInfra.OpenStore(context.Background(), databasePath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	t.Cleanup(func() { _ = store.Close() })

	return store, databasePath
}

// reshape runs statements on a connection of its own, the way another program sharing the file
// could under a store already running.
func reshape(t *testing.T, databasePath string, statements string) {
	t.Helper()

	handle, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open the database beside the store: %v", err)
	}

	defer func() { _ = handle.Close() }()

	if _, err := handle.Exec(statements); err != nil {
		t.Fatalf("reshape the database: %v", err)
	}
}

func TestOpenStore_APlaceThatCannotHoldTheSessions_IsRefused(t *testing.T) {
	notADatabase := filepath.Join(t.TempDir(), databaseFileName)
	if err := os.WriteFile(notADatabase, []byte(strings.Repeat("not a database ", 100)), ownerOnlyMode); err != nil {
		t.Fatalf("write the file: %v", err)
	}

	tests := []struct {
		name        string
		givePath    string
		wantMessage string
	}{
		{name: "a path the connector cannot parse", givePath: filepath.Join(t.TempDir(), "analyses?%zz"), wantMessage: "open live sessions database"},
		{name: "a file that is not a database", givePath: notADatabase, wantMessage: "prepare live sessions"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := sharingInfra.OpenStore(context.Background(), tt.givePath)

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("err = %v, want one saying %q", err, tt.wantMessage)
			}
		})
	}
}

func TestStore_Closed_FailsEveryCall(t *testing.T) {
	store, _ := storeOnDisk(t)
	if err := store.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	tests := []struct {
		name        string
		giveCall    func() error
		wantMessage string
	}{
		{name: "list", giveCall: func() error {
			_, err := store.List(context.Background())

			return err
		}, wantMessage: "list live sessions"},
		{name: "get", giveCall: func() error {
			_, err := store.Get(context.Background(), "cpu")

			return err
		}, wantMessage: "scan live session"},
		{name: "save", giveCall: func() error { return store.Save(context.Background(), ownedSession("cpu")) }, wantMessage: "save live session"},
		{name: "renew", giveCall: func() error { return store.Renew(context.Background(), "cpu", domain.Revision{}) }, wantMessage: "renew live session"},
		{name: "forget", giveCall: func() error { return store.Forget(context.Background(), "cpu") }, wantMessage: "forget live session"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.giveCall(); err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("err = %v, want one saying %q", err, tt.wantMessage)
			}
		})
	}
}

func TestStore_ARowThatDoesNotRead_IsReported(t *testing.T) {
	tests := []struct {
		name        string
		giveReshape string
		wantMessage string
	}{
		{name: "a revision that is not a number", giveReshape: `UPDATE live_sessions SET revision = 'third'`, wantMessage: "scan live session"},
		{name: "files that are not JSON", giveReshape: `UPDATE live_sessions SET files = 'not JSON'`, wantMessage: "read the files"},
		{name: "a log that is not JSON", giveReshape: `UPDATE live_sessions SET log = 'not JSON'`, wantMessage: "read the log"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, databasePath := storeOnDisk(t)
			save(t, store, ownedSession("cpu"))
			reshape(t, databasePath, tt.giveReshape)

			if _, err := store.List(context.Background()); err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("list = %v, want one saying %q", err, tt.wantMessage)
			}
		})
	}
}

// sessionsFailingOnTheSecondRow decodes each session's files only as its row is read, and only the
// session saved first holds files written as JSON text, so the listing fails partway rather than
// when the query starts.
const sessionsFailingOnTheSecondRow = `
ALTER TABLE live_sessions RENAME TO written_sessions;
CREATE VIEW live_sessions AS SELECT rowid AS rowid, analysis_id, session_id, owner_token, session_key, revision, expires_at,
	json_extract(files, '$') AS files, log FROM written_sessions;
UPDATE written_sessions SET files = json_quote(files) WHERE analysis_id = 'cpu';
UPDATE written_sessions SET files = 'not JSON' WHERE analysis_id = 'memory';`

func TestStore_AListingThatFailsPartway_IsReported(t *testing.T) {
	store, databasePath := storeOnDisk(t)
	save(t, store, ownedSession("cpu"), ownedSession("memory"))
	reshape(t, databasePath, sessionsFailingOnTheSecondRow)

	if _, err := store.List(context.Background()); err == nil || !strings.Contains(err.Error(), "read live sessions") {
		t.Errorf("list = %v, want the listing reported as cut short", err)
	}
}
