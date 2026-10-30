//go:build !js

package infrastructure_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
)

const (
	databaseFileName = "analyses.db"
	keepNone         = 0
	ownerOnlyMode    = 0o600
)

// storeOnDisk opens a store on a fresh file and hands back where that file is, so a test can reach
// the same database through a connection of its own.
func storeOnDisk(t *testing.T) (*searchesInfra.Store, string) {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), databaseFileName)

	store, err := searchesInfra.OpenStore(context.Background(), databasePath)
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

func TestOpenStore_AFileThatIsNotADatabase_IsRefused(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), databaseFileName)
	if err := os.WriteFile(databasePath, []byte(strings.Repeat("not a database ", 100)), ownerOnlyMode); err != nil {
		t.Fatalf("write the file: %v", err)
	}

	_, err := searchesInfra.OpenStore(context.Background(), databasePath)

	if err == nil || !strings.Contains(err.Error(), "open search history database") {
		t.Fatalf("err = %v, want the history refused", err)
	}
}

func TestStore_Closed_FailsEveryCall(t *testing.T) {
	store, _ := storeOnDisk(t)
	remember(t, store, chartLibraryField, "cpu")

	if err := store.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	tests := []struct {
		name        string
		giveCall    func(callerContext context.Context) error
		wantMessage string
	}{
		{name: "terms", giveCall: func(callerContext context.Context) error {
			_, err := store.Terms(callerContext, chartLibraryField)

			return err
		}, wantMessage: "list search terms"},
		{name: "remember", giveCall: func(callerContext context.Context) error {
			return store.Remember(callerContext, chartLibraryField, "memory", keepThree)
		}, wantMessage: "begin remembering a search"},
		{name: "forget", giveCall: func(callerContext context.Context) error {
			return store.Forget(callerContext, chartLibraryField, "cpu")
		}, wantMessage: "forget search term"},
		{name: "delete all", giveCall: func(callerContext context.Context) error {
			return store.DeleteAll(callerContext)
		}, wantMessage: "delete search history"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.giveCall(context.Background())

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Fatalf("err = %v, want one saying %q", err, tt.wantMessage)
			}
		})
	}
}

// termsWithoutAValue hands every term back as NULL, which no term the store wrote can be.
const termsWithoutAValue = `
ALTER TABLE search_history RENAME TO written_history;
CREATE VIEW search_history AS SELECT field, NULL AS term, sequence FROM written_history;`

func TestTerms_ATermWithoutAValue_IsReported(t *testing.T) {
	store, databasePath := storeOnDisk(t)
	remember(t, store, chartLibraryField, "cpu")
	reshape(t, databasePath, termsWithoutAValue)

	_, err := store.Terms(context.Background(), chartLibraryField)

	if err == nil || !strings.Contains(err.Error(), "scan search term") {
		t.Fatalf("err = %v, want the unreadable term reported", err)
	}
}

// termsFailingOnTheSecondRow decodes each term only as its row is read, and only the term
// remembered last is valid JSON, so the listing fails partway rather than when the query starts.
// The index is what keeps SQLite from sorting, which would read every row before the first.
const termsFailingOnTheSecondRow = `
ALTER TABLE search_history RENAME TO written_history;
CREATE INDEX written_history_by_sequence ON written_history (field, sequence);
CREATE VIEW search_history AS SELECT field, json_extract(term, '$') AS term, sequence FROM written_history;
UPDATE written_history SET term = json_quote(term) WHERE term = 'memory';`

func TestTerms_ATermThatFailsPartwayThroughTheListing_IsReported(t *testing.T) {
	store, databasePath := storeOnDisk(t)
	remember(t, store, chartLibraryField, "cpu", "memory")
	reshape(t, databasePath, termsFailingOnTheSecondRow)

	_, err := store.Terms(context.Background(), chartLibraryField)

	if err == nil || !strings.Contains(err.Error(), "read search terms") {
		t.Fatalf("err = %v, want the listing reported as cut short", err)
	}
}

// historyOwnedByAField replaces the history with one whose every term must name a field that is
// listed elsewhere, checked only when the transaction commits, and lists none.
const historyOwnedByAField = `
DROP TABLE search_history;
CREATE TABLE fields (name TEXT PRIMARY KEY);
CREATE TABLE search_history (
	field    TEXT    NOT NULL REFERENCES fields(name) DEFERRABLE INITIALLY DEFERRED,
	term     TEXT    NOT NULL COLLATE NOCASE,
	sequence INTEGER NOT NULL,
	PRIMARY KEY (field, term)
);`

func TestRemember_AWriteTheDatabaseRefuses_IsReportedAndLeavesTheHistoryAsItWas(t *testing.T) {
	tests := []struct {
		name        string
		giveReshape string
		giveKeep    int
		wantMessage string
	}{
		{
			name:        "the term refused",
			giveReshape: `CREATE TRIGGER refuse_terms BEFORE INSERT ON search_history BEGIN SELECT RAISE(ABORT, 'refused'); END;`,
			giveKeep:    keepThree,
			wantMessage: "remember search term",
		},
		{
			name:        "the trim refused",
			giveReshape: `CREATE TRIGGER refuse_trims BEFORE DELETE ON search_history BEGIN SELECT RAISE(ABORT, 'refused'); END;`,
			giveKeep:    keepNone,
			wantMessage: "trim search history",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, databasePath := storeOnDisk(t)
			remember(t, store, chartLibraryField, "cpu")
			reshape(t, databasePath, tt.giveReshape)

			err := store.Remember(context.Background(), chartLibraryField, "memory", tt.giveKeep)

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Fatalf("err = %v, want one saying %q", err, tt.wantMessage)
			}

			if got, want := termsOf(t, store, chartLibraryField), []string{"cpu"}; !slices.Equal(got, want) {
				t.Errorf("terms = %q, want %q: the refused write rolled back", got, want)
			}
		})
	}
}

func TestRemember_ACommitTheDatabaseRefuses_IsReportedAndKeepsNothing(t *testing.T) {
	store, databasePath := storeOnDisk(t)
	reshape(t, databasePath, historyOwnedByAField)

	err := store.Remember(context.Background(), chartLibraryField, "cpu", keepThree)

	if err == nil || !strings.Contains(err.Error(), "commit a remembered search") {
		t.Fatalf("err = %v, want the refused commit reported", err)
	}

	if got := termsOf(t, store, chartLibraryField); len(got) != 0 {
		t.Errorf("terms = %q, want none after the commit was refused", got)
	}
}
