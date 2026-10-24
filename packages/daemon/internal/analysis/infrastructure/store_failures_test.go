//go:build !js

package infrastructure_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

const keptAnalysisID = "a1"

// storeOnDisk opens a store on a fresh file and hands back where that file is, so a test can reach
// the same database through a connection of its own.
func storeOnDisk(t *testing.T) (*analysisInfra.Store, string) {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), "analyses.db")

	store, err := analysisInfra.OpenStore(context.Background(), databasePath, "")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	t.Cleanup(func() { _ = store.Close() })

	return store, databasePath
}

// reshape runs statements on a connection of its own, the way another program sharing the file
// could, whether before a store opens it or under one already running.
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

func storeKeepingAnAnalysis(t *testing.T) (*analysisInfra.Store, string) {
	t.Helper()

	store, databasePath := storeOnDisk(t)
	if err := store.Save(context.Background(), analysisFixture(keptAnalysisID, "Capacity")); err != nil {
		t.Fatalf("save: %v", err)
	}

	return store, databasePath
}

func TestOpenStore_APathTheConnectorCannotParse_IsRefused(t *testing.T) {
	_, err := analysisInfra.OpenStore(context.Background(), filepath.Join(t.TempDir(), "analyses?%zz"), "")

	if err == nil || !strings.Contains(err.Error(), "open analyses database") {
		t.Fatalf("err = %v, want the database refused before it is opened", err)
	}
}

func TestStore_Closed_FailsEveryCallWithoutReportingANotFoundAnalysis(t *testing.T) {
	store, _ := storeKeepingAnAnalysis(t)
	if err := store.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	tests := []struct {
		name     string
		giveCall func(callerContext context.Context) error
	}{
		{name: "list", giveCall: func(callerContext context.Context) error {
			_, err := store.List(callerContext)

			return err
		}},
		{name: "get", giveCall: func(callerContext context.Context) error {
			_, err := store.Get(callerContext, keptAnalysisID)

			return err
		}},
		{name: "touch", giveCall: func(callerContext context.Context) error {
			return store.Touch(callerContext, keptAnalysisID, time.Now())
		}},
		{name: "rename", giveCall: func(callerContext context.Context) error {
			return store.Rename(callerContext, keptAnalysisID, "Latency")
		}},
		{name: "save canvas", giveCall: func(callerContext context.Context) error {
			return store.SaveCanvas(callerContext, keptAnalysisID, nil)
		}},
		{name: "save library order", giveCall: func(callerContext context.Context) error {
			return store.SaveLibraryOrder(callerContext, keptAnalysisID, nil)
		}},
		{name: "save series colors", giveCall: func(callerContext context.Context) error {
			return store.SaveSeriesColors(callerContext, keptAnalysisID, nil)
		}},
		{name: "save", giveCall: func(callerContext context.Context) error {
			return store.Save(callerContext, analysisFixture(keptAnalysisID, "Latency"))
		}},
		{name: "add sources", giveCall: func(callerContext context.Context) error {
			_, err := store.AddSources(callerContext, keptAnalysisID, nil)

			return err
		}},
		{name: "delete", giveCall: func(callerContext context.Context) error {
			return store.Delete(callerContext, keptAnalysisID)
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.giveCall(context.Background())

			if err == nil || errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
				t.Fatalf("err = %v, want the closed database reported", err)
			}
		})
	}
}

func TestStore_AnAnalysisRowItCannotRead_FailsGetAndList(t *testing.T) {
	tests := []struct {
		name        string
		giveReshape string
		wantMessage string
	}{
		{name: "a creation time that is not a number", giveReshape: `UPDATE analyses SET created_at = 'not a moment'`, wantMessage: "read analysis"},
		{name: "a canvas that is not JSON", giveReshape: `UPDATE analyses SET canvas = 'not json'`, wantMessage: "decode the canvas"},
		{name: "a library order that is not JSON", giveReshape: `UPDATE analyses SET library_order = 'not json'`, wantMessage: "decode the library order"},
		{name: "series colors that are not JSON", giveReshape: `UPDATE analyses SET series_colors = 'not json'`, wantMessage: "decode the series colors"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, databasePath := storeKeepingAnAnalysis(t)
			reshape(t, databasePath, tt.giveReshape)

			_, getErr := store.Get(context.Background(), keptAnalysisID)
			_, listErr := store.List(context.Background())

			for _, err := range []error{getErr, listErr} {
				if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
					t.Errorf("err = %v, want one saying %q", err, tt.wantMessage)
				}
			}
		})
	}
}

// The view decodes the canvas only as each row is read, so the first analysis comes back and the
// second fails partway through the listing rather than when the query starts. The index is what
// keeps SQLite from sorting, which would read every row before handing back the first.
const analysesFailingOnTheSecondRow = `
ALTER TABLE analyses RENAME TO written_analyses;
CREATE INDEX written_analyses_by_access ON written_analyses (last_accessed DESC);
CREATE VIEW analyses AS
	SELECT rowid AS rowid, id, name, chart_count, json(canvas) AS canvas, library_order, series_colors, created_at, last_accessed
	FROM written_analyses;
UPDATE written_analyses SET canvas = '[' WHERE id = 'opened-first';`

func TestList_AnAnalysisThatFailsPartwayThroughTheListing_IsReported(t *testing.T) {
	store, databasePath := storeOnDisk(t)
	openedLast := analysisFixture("opened-last", "Capacity")
	openedFirst := analysisFixture("opened-first", "Latency")
	openedFirst.LastAccessed = openedLast.LastAccessed.Add(-time.Hour)

	for _, analysis := range []analysisDomain.Analysis{openedLast, openedFirst} {
		if err := store.Save(context.Background(), analysis); err != nil {
			t.Fatalf("save %q: %v", analysis.ID, err)
		}
	}

	reshape(t, databasePath, analysesFailingOnTheSecondRow)

	_, err := store.List(context.Background())

	if err == nil || !strings.Contains(err.Error(), "read analyses") {
		t.Fatalf("err = %v, want the listing reported as cut short", err)
	}
}

// sourcesFailingOnTheSecondRow leaves the first source of the kept analysis readable and makes the
// second fail as it is read, which the primary key lets SQLite reach without sorting first.
const sourcesFailingOnTheSecondRow = `
ALTER TABLE analysis_sources RENAME TO written_sources;
CREATE VIEW analysis_sources AS SELECT analysis_id, position, json_extract(name, '$') AS name, path, size FROM written_sources;
UPDATE written_sources SET name = json_quote(name) WHERE position = 0;`

func TestStore_SourcesItCannotRead_FailGetListAndAddSources(t *testing.T) {
	tests := []struct {
		name        string
		giveReshape string
	}{
		{name: "the sources table is gone", giveReshape: `DROP TABLE analysis_sources`},
		{name: "a size that is not a number", giveReshape: `UPDATE analysis_sources SET size = 'many' WHERE position = 1`},
		{name: "a source that fails as it is read", giveReshape: sourcesFailingOnTheSecondRow},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, databasePath := storeKeepingAnAnalysis(t)
			reshape(t, databasePath, tt.giveReshape)

			_, getErr := store.Get(context.Background(), keptAnalysisID)
			_, listErr := store.List(context.Background())
			_, addErr := store.AddSources(context.Background(), keptAnalysisID, []analysisDomain.SourceFile{{Name: "late.rrd", Path: "/sources/late.rrd"}})

			for call, err := range map[string]error{"get": getErr, "list": listErr, "add sources": addErr} {
				if err == nil || errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
					t.Errorf("%s err = %v, want the unreadable sources reported", call, err)
				}
			}
		})
	}
}

// Each refusal fails one kind of write inside the transaction that runs it: the analysis row, a
// source row, replacing the sources, or the commit itself, which a deferred foreign key checks only
// once every statement before it has gone through.
const (
	refuseAnalysisWrites       = `CREATE TRIGGER refuse BEFORE INSERT ON analyses BEGIN SELECT RAISE(ABORT, 'refused'); END`
	refuseSourceWrites         = `CREATE TRIGGER refuse BEFORE INSERT ON analysis_sources BEGIN SELECT RAISE(ABORT, 'refused'); END`
	refuseSourceReplacement    = `CREATE TRIGGER refuse BEFORE DELETE ON analysis_sources BEGIN SELECT RAISE(ABORT, 'refused'); END`
	refuseCommittingAnySources = `
CREATE TABLE owners (id TEXT PRIMARY KEY);
DROP TABLE analysis_sources;
CREATE TABLE analysis_sources (
	analysis_id TEXT NOT NULL REFERENCES owners(id) DEFERRABLE INITIALLY DEFERRED,
	position INTEGER NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL,
	PRIMARY KEY (analysis_id, position)
);`
)

func TestStore_AWriteTheDatabaseRefuses_IsReportedAndLeavesTheAnalysisAsItWas(t *testing.T) {
	saveAgain := func(callerContext context.Context, store *analysisInfra.Store) error {
		return store.Save(callerContext, analysisFixture(keptAnalysisID, "Latency"))
	}
	addLateSource := func(callerContext context.Context, store *analysisInfra.Store) error {
		_, err := store.AddSources(callerContext, keptAnalysisID, []analysisDomain.SourceFile{{Name: "late.rrd", Path: "/sources/late.rrd"}})

		return err
	}

	tests := []struct {
		name        string
		giveReshape string
		giveWrite   func(callerContext context.Context, store *analysisInfra.Store) error
		wantMessage string
	}{
		{name: "save, the analysis row refused", giveReshape: refuseAnalysisWrites, giveWrite: saveAgain, wantMessage: "save analysis"},
		{name: "save, replacing the sources refused", giveReshape: refuseSourceReplacement, giveWrite: saveAgain, wantMessage: "replace sources"},
		{name: "save, a source refused", giveReshape: refuseSourceWrites, giveWrite: saveAgain, wantMessage: "save source"},
		{name: "save, the commit refused", giveReshape: refuseCommittingAnySources, giveWrite: saveAgain, wantMessage: "commit transaction"},
		{name: "add sources, a source refused", giveReshape: refuseSourceWrites, giveWrite: addLateSource, wantMessage: "add source"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, databasePath := storeKeepingAnAnalysis(t)
			reshape(t, databasePath, tt.giveReshape)

			err := tt.giveWrite(context.Background(), store)

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Fatalf("err = %v, want one saying %q", err, tt.wantMessage)
			}

			kept, err := store.Get(context.Background(), keptAnalysisID)
			if err != nil {
				t.Fatalf("get after the refused write: %v", err)
			}

			if kept.Name != "Capacity" {
				t.Errorf("name after the refused write = %q, want the write rolled back", kept.Name)
			}
		})
	}
}

func TestAddSources_TheAnalysesTableGone_ReportsTheLookupFailing(t *testing.T) {
	store, databasePath := storeKeepingAnAnalysis(t)
	reshape(t, databasePath, `DROP TABLE analyses`)

	_, err := store.AddSources(context.Background(), keptAnalysisID, []analysisDomain.SourceFile{{Name: "late.rrd", Path: "/sources/late.rrd"}})

	if err == nil || !strings.Contains(err.Error(), "find analysis") {
		t.Fatalf("err = %v, want the lookup of the analysis reported", err)
	}
}
