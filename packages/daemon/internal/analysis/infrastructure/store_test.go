//go:build !js

package infrastructure_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

func analysisFixture(id string, name string) analysisDomain.Analysis {
	moment := time.UnixMilli(1_788_026_400_000)

	return analysisDomain.Analysis{
		ID:           id,
		Name:         name,
		CreatedAt:    moment,
		LastAccessed: moment,
		Canvas: []analysisDomain.CanvasChart{
			{SeriesID: "s3", Label: "system_cpu_user", Merged: []analysisDomain.MergedSeries{{SeriesID: "s4", Label: "system_cpu_system", Axis: 0}}},
			{SeriesID: "s5", Label: "system_memory_used", Merged: []analysisDomain.MergedSeries{}},
		},
		Files: []analysisDomain.SourceFile{
			{Name: "atlas_prod.rrd", Path: "/sources/atlas_prod.rrd", Size: 2048},
			{Name: "atlas_replica.rrd", Path: "/sources/atlas_replica.rrd", Size: 4096},
		},
	}
}

func openStore(t *testing.T, legacyPath string) *analysisInfra.Store {
	t.Helper()

	store, err := analysisInfra.OpenStore(context.Background(), filepath.Join(t.TempDir(), "analyses.db"), legacyPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	t.Cleanup(func() { _ = store.Close() })

	return store
}

func TestOpenStoreStartsOnAnEmptyLibrary(t *testing.T) {
	stored, err := openStore(t, "").List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(stored) != 0 {
		t.Fatalf("a new installation listed %d analyses, want none", len(stored))
	}
}

func TestSaveRoundTripsAnAnalysisWithItsSourcesAndCanvasInOrder(t *testing.T) {
	store := openStore(t, "")
	saved := analysisFixture("a1", "Atlas prod capacity")

	if err := store.Save(context.Background(), saved); err != nil {
		t.Fatalf("save: %v", err)
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(stored) != 1 {
		t.Fatalf("listed %d analyses, want 1", len(stored))
	}

	read := stored[0]
	if read.Name != saved.Name {
		t.Errorf("read back %q, want %q", read.Name, saved.Name)
	}

	if !reflect.DeepEqual(read.Canvas, saved.Canvas) {
		t.Errorf("canvas came back as %+v, want %+v", read.Canvas, saved.Canvas)
	}

	if !read.LastAccessed.Equal(saved.LastAccessed) {
		t.Errorf("last accessed = %v, want %v", read.LastAccessed, saved.LastAccessed)
	}

	if len(read.Files) != 2 || read.Files[0].Name != "atlas_prod.rrd" || read.Files[1].Size != 4096 {
		t.Errorf("sources came back as %+v", read.Files)
	}
}

func TestSaveWritesAnAbsentCanvasAsAnEmptyOne(t *testing.T) {
	store := openStore(t, "")
	saved := analysisFixture("a1", "no charts")
	saved.Canvas = nil

	if err := store.Save(context.Background(), saved); err != nil {
		t.Fatalf("save: %v", err)
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if stored[0].Canvas == nil || len(stored[0].Canvas) != 0 {
		t.Errorf("canvas = %#v, want an empty, non-nil canvas", stored[0].Canvas)
	}
}

func TestSaveReplacesAnExistingAnalysisWithoutMovingIt(t *testing.T) {
	store := openStore(t, "")
	for _, id := range []string{"a1", "a2", "a3"} {
		if err := store.Save(context.Background(), analysisFixture(id, id)); err != nil {
			t.Fatalf("save %s: %v", id, err)
		}
	}

	renamed := analysisFixture("a1", "renamed")
	renamed.Files = renamed.Files[:1]
	if err := store.Save(context.Background(), renamed); err != nil {
		t.Fatalf("save again: %v", err)
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(stored) != 3 {
		t.Fatalf("listed %d analyses, want 3", len(stored))
	}

	if stored[0].ID != "a1" || stored[0].Name != "renamed" {
		t.Errorf("first analysis = %q/%q, want a1/renamed", stored[0].ID, stored[0].Name)
	}

	if len(stored[0].Files) != 1 {
		t.Errorf("sources = %d, want the replacement's 1", len(stored[0].Files))
	}
}

func TestDeleteTakesTheSourcesWithIt(t *testing.T) {
	store := openStore(t, "")
	if err := store.Save(context.Background(), analysisFixture("a1", "one")); err != nil {
		t.Fatalf("save: %v", err)
	}

	if err := store.Delete(context.Background(), "a1"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if err := store.Save(context.Background(), analysisFixture("a1", "one again")); err != nil {
		t.Fatalf("save after delete: %v", err)
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(stored) != 1 || len(stored[0].Files) != 2 {
		t.Fatalf("re-created analysis has %d sources, want 2 and no orphans", len(stored[0].Files))
	}
}

func TestOpenStoreAddsTheCanvasToALibraryWrittenByAnEarlierBuild(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "analyses.db")

	earlier, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open earlier database: %v", err)
	}

	_, err = earlier.Exec(`
		CREATE TABLE analyses (id TEXT PRIMARY KEY, name TEXT NOT NULL, chart_count INTEGER NOT NULL, created_at INTEGER NOT NULL, last_accessed INTEGER NOT NULL);
		INSERT INTO analyses (id, name, chart_count, created_at, last_accessed) VALUES ('a1', 'from an earlier build', 4, 0, 0);`)
	if err != nil {
		t.Fatalf("write earlier library: %v", err)
	}
	_ = earlier.Close()

	store, err := analysisInfra.OpenStore(context.Background(), databasePath, "")
	if err != nil {
		t.Fatalf("open store over an earlier library: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(stored) != 1 || stored[0].Name != "from an earlier build" || len(stored[0].Canvas) != 0 || len(stored[0].LibraryOrder) != 0 {
		t.Fatalf("earlier library read back as %+v, want its analysis on an empty canvas and an unarranged library", stored)
	}

	if err := store.Save(context.Background(), analysisFixture("a1", "saved again")); err != nil {
		t.Fatalf("save into the migrated library: %v", err)
	}
}

func TestOpenStoreCarriesALibraryOverFromTheJSONFileItReplaced(t *testing.T) {
	directory := t.TempDir()
	legacyPath := filepath.Join(directory, "analyses.json")

	encoded, err := json.Marshal([]analysisDomain.Analysis{analysisFixture("a1", "from json"), analysisFixture("a2", "also from json")})
	if err != nil {
		t.Fatalf("encode legacy library: %v", err)
	}

	if err := os.WriteFile(legacyPath, encoded, 0o600); err != nil {
		t.Fatalf("write legacy library: %v", err)
	}

	databasePath := filepath.Join(directory, "analyses.db")
	store, err := analysisInfra.OpenStore(context.Background(), databasePath, legacyPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(stored) != 2 || stored[0].Name != "from json" || len(stored[0].Files) != 2 {
		t.Fatalf("imported %d analyses, first %+v", len(stored), stored[0])
	}

	if err := store.Delete(context.Background(), "a1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	_ = store.Close()

	reopened, err := analysisInfra.OpenStore(context.Background(), databasePath, legacyPath)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })

	after, err := reopened.List(context.Background())
	if err != nil {
		t.Fatalf("list after reopen: %v", err)
	}

	if len(after) != 1 {
		t.Fatalf("reopening imported the json a second time: %d analyses", len(after))
	}

	if _, err := os.Stat(legacyPath); err != nil {
		t.Errorf("the json the library came from was not left in place: %v", err)
	}
}

func TestOpenStoreAfterEveryAnalysisWasDeletedDoesNotBringTheJSONLibraryBack(t *testing.T) {
	directory := t.TempDir()
	legacyPath := filepath.Join(directory, "analyses.json")
	databasePath := filepath.Join(directory, "analyses.db")

	encoded, err := json.Marshal([]analysisDomain.Analysis{analysisFixture("a1", "from json")})
	if err != nil {
		t.Fatalf("encode legacy library: %v", err)
	}

	if err := os.WriteFile(legacyPath, encoded, 0o600); err != nil {
		t.Fatalf("write legacy library: %v", err)
	}

	store, err := analysisInfra.OpenStore(context.Background(), databasePath, legacyPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	if err := store.Delete(context.Background(), "a1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	_ = store.Close()

	reopened, err := analysisInfra.OpenStore(context.Background(), databasePath, legacyPath)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })

	if stored, _ := reopened.List(context.Background()); len(stored) != 0 {
		t.Errorf("reopening an emptied library imported the json again: %d analyses", len(stored))
	}
}

func TestOpenStoreWithAnUnreadableJSONLibraryStillOpensOnAnEmptyLibrary(t *testing.T) {
	directory := t.TempDir()
	legacyPath := filepath.Join(directory, "analyses.json")

	if err := os.WriteFile(legacyPath, []byte(`[{"id":"a1","name":"cut sh`), 0o600); err != nil {
		t.Fatalf("write legacy library: %v", err)
	}

	store, err := analysisInfra.OpenStore(context.Background(), filepath.Join(directory, "analyses.db"), legacyPath)
	if err != nil {
		t.Fatalf("open store over a truncated json library: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	if stored, _ := store.List(context.Background()); len(stored) != 0 {
		t.Errorf("stored = %d analyses, want an empty library", len(stored))
	}
}

func TestGetReadsOneAnalysisWithItsSourcesInOrder(t *testing.T) {
	store := openStore(t, "")
	for _, analysis := range []analysisDomain.Analysis{analysisFixture("a1", "Capacity"), analysisFixture("a2", "Latency")} {
		if err := store.Save(context.Background(), analysis); err != nil {
			t.Fatalf("save %s: %v", analysis.ID, err)
		}
	}

	got, err := store.Get(context.Background(), "a2")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	want := analysisFixture("a2", "Latency")
	if got.Name != want.Name || len(got.Files) != 2 || got.Files[1] != want.Files[1] || len(got.Canvas) != 2 || !got.LastAccessed.Equal(want.LastAccessed) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestGetReportsAnIdentifierTheLibraryDoesNotHold(t *testing.T) {
	_, err := openStore(t, "").Get(context.Background(), "missing")

	if !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestTouchMovesOnlyTheAccessTime(t *testing.T) {
	store := openStore(t, "")
	if err := store.Save(context.Background(), analysisFixture("a1", "Capacity")); err != nil {
		t.Fatalf("save: %v", err)
	}

	opened := time.UnixMilli(1_790_000_000_000)
	if err := store.Touch(context.Background(), "a1", opened); err != nil {
		t.Fatalf("touch: %v", err)
	}

	got, _ := store.Get(context.Background(), "a1")
	if !got.LastAccessed.Equal(opened) || len(got.Files) != 2 || len(got.Canvas) != 2 || got.Name != "Capacity" {
		t.Fatalf("after touch %+v, want only the access time moved", got)
	}
}

func TestRenameReplacesOnlyTheName(t *testing.T) {
	store := openStore(t, "")
	if err := store.Save(context.Background(), analysisFixture("a1", "Capacity")); err != nil {
		t.Fatalf("save: %v", err)
	}

	if err := store.Rename(context.Background(), "a1", "Atlas prod"); err != nil {
		t.Fatalf("rename: %v", err)
	}

	got, _ := store.Get(context.Background(), "a1")
	want := analysisFixture("a1", "Atlas prod")
	if got.Name != want.Name || !reflect.DeepEqual(got.Files, want.Files) || !reflect.DeepEqual(got.Canvas, want.Canvas) {
		t.Fatalf("after rename %+v, want only the name changed", got)
	}
}

func TestSaveCanvasReplacesOnlyTheCanvas(t *testing.T) {
	store := openStore(t, "")
	if err := store.Save(context.Background(), analysisFixture("a1", "Capacity")); err != nil {
		t.Fatalf("save: %v", err)
	}

	canvas := []analysisDomain.CanvasChart{{
		SeriesID: "s9",
		Label:    "http_latency_p95",
		Merged:   []analysisDomain.MergedSeries{{SeriesID: "s1", Label: "runtime_gc_pause", Axis: 1}},
	}}
	if err := store.SaveCanvas(context.Background(), "a1", canvas); err != nil {
		t.Fatalf("save canvas: %v", err)
	}

	got, _ := store.Get(context.Background(), "a1")
	if !reflect.DeepEqual(got.Canvas, canvas) || len(got.Files) != 2 {
		t.Fatalf("after saving the canvas %+v, want one chart and the sources untouched", got)
	}
}

func TestSaveCanvasKeepsEachChartReadableByABuildThatCannotMerge(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "analyses.db")
	store, err := analysisInfra.OpenStore(context.Background(), databasePath, "")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	if err := store.Save(context.Background(), analysisFixture("a1", "Capacity")); err != nil {
		t.Fatalf("save: %v", err)
	}

	reader, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open the database the way an earlier build would: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	var encoded string
	var chartCount int
	if err := reader.QueryRow(`SELECT canvas, chart_count FROM analyses WHERE id = 'a1'`).Scan(&encoded, &chartCount); err != nil {
		t.Fatalf("read the stored canvas: %v", err)
	}

	var earlierCanvas []analysisDomain.ChartReference
	if err := json.Unmarshal([]byte(encoded), &earlierCanvas); err != nil {
		t.Fatalf("decode the canvas as a list of chart references: %v", err)
	}

	want := []analysisDomain.ChartReference{{SeriesID: "s3", Label: "system_cpu_user"}, {SeriesID: "s5", Label: "system_memory_used"}}
	if !reflect.DeepEqual(earlierCanvas, want) || chartCount != 2 {
		t.Fatalf("an earlier build reads the canvas as %+v with %d charts, want %+v with 2", earlierCanvas, chartCount, want)
	}
}

func TestSaveLibraryOrderReplacesOnlyTheLibraryOrder(t *testing.T) {
	store := openStore(t, "")
	if err := store.Save(context.Background(), analysisFixture("a1", "Capacity")); err != nil {
		t.Fatalf("save: %v", err)
	}

	order := []analysisDomain.ChartReference{{SeriesID: "s9", Label: "http_latency_p95"}, {SeriesID: "s0", Label: "runtime_goroutines"}}
	if err := store.SaveLibraryOrder(context.Background(), "a1", order); err != nil {
		t.Fatalf("save library order: %v", err)
	}

	got, _ := store.Get(context.Background(), "a1")
	if len(got.LibraryOrder) != 2 || got.LibraryOrder[0] != order[0] || got.LibraryOrder[1] != order[1] {
		t.Errorf("library order = %+v, want %+v", got.LibraryOrder, order)
	}

	if len(got.Canvas) != 2 || len(got.Files) != 2 || got.Name != "Capacity" {
		t.Errorf("after saving the library order %+v, want the canvas and the sources untouched", got)
	}
}

func TestSaveKeepsTheLibraryOrderAndWritesAnAbsentOneAsEmpty(t *testing.T) {
	store := openStore(t, "")
	arranged := analysisFixture("a1", "arranged")
	arranged.LibraryOrder = []analysisDomain.ChartReference{{SeriesID: "s2", Label: "runtime_heap_objects"}}
	unarranged := analysisFixture("a2", "unarranged")

	for _, analysis := range []analysisDomain.Analysis{arranged, unarranged} {
		if err := store.Save(context.Background(), analysis); err != nil {
			t.Fatalf("save %q: %v", analysis.ID, err)
		}
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(stored[0].LibraryOrder) != 1 || stored[0].LibraryOrder[0] != arranged.LibraryOrder[0] {
		t.Errorf("library order = %+v, want %+v", stored[0].LibraryOrder, arranged.LibraryOrder)
	}

	if stored[1].LibraryOrder == nil || len(stored[1].LibraryOrder) != 0 {
		t.Errorf("library order = %#v, want an empty, non-nil order", stored[1].LibraryOrder)
	}
}

func TestOpenStoreAddsTheLibraryOrderToALibraryThatAlreadyKeptCanvases(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "analyses.db")

	earlier, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open earlier database: %v", err)
	}

	_, err = earlier.Exec(`
		CREATE TABLE analyses (id TEXT PRIMARY KEY, name TEXT NOT NULL, chart_count INTEGER NOT NULL, canvas TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, last_accessed INTEGER NOT NULL);
		INSERT INTO analyses (id, name, chart_count, canvas, created_at, last_accessed) VALUES ('a1', 'with a canvas', 1, '[{"seriesId":"s3","label":"system_cpu_user"}]', 0, 0);`)
	if err != nil {
		t.Fatalf("write earlier library: %v", err)
	}
	_ = earlier.Close()

	store, err := analysisInfra.OpenStore(context.Background(), databasePath, "")
	if err != nil {
		t.Fatalf("open store over an earlier library: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	got, err := store.Get(context.Background(), "a1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if len(got.Canvas) != 1 || got.Canvas[0].Label != "system_cpu_user" || len(got.LibraryOrder) != 0 {
		t.Fatalf("earlier library read back as %+v, want its canvas kept and the library in the sources' order", got)
	}

	if got.Canvas[0].Merged == nil || len(got.Canvas[0].Merged) != 0 {
		t.Fatalf("merged series of a chart saved before charts could merge = %#v, want an empty, non-nil list", got.Canvas[0].Merged)
	}

	if err := store.SaveLibraryOrder(context.Background(), "a1", []analysisDomain.ChartReference{{SeriesID: "s0", Label: "runtime_goroutines"}}); err != nil {
		t.Fatalf("save a library order into the migrated library: %v", err)
	}
}

func TestSaveSeriesColorsReplacesOnlyTheSeriesColors(t *testing.T) {
	store := openStore(t, "")
	arranged := analysisFixture("a1", "Capacity")
	arranged.LibraryOrder = []analysisDomain.ChartReference{{SeriesID: "s2", Label: "runtime_heap_objects"}}
	if err := store.Save(context.Background(), arranged); err != nil {
		t.Fatalf("save: %v", err)
	}

	colors := []analysisDomain.SeriesColor{{SeriesID: "s3", Label: "system_cpu_user", Color: "#aabbcc"}, {SeriesID: "s0", Label: "runtime_goroutines", Color: "#112233"}}
	if err := store.SaveSeriesColors(context.Background(), "a1", colors); err != nil {
		t.Fatalf("save series colors: %v", err)
	}

	got, _ := store.Get(context.Background(), "a1")
	if !reflect.DeepEqual(got.SeriesColors, colors) {
		t.Errorf("series colors = %+v, want %+v", got.SeriesColors, colors)
	}

	if len(got.Canvas) != 2 || len(got.Files) != 2 || got.Name != "Capacity" || !reflect.DeepEqual(got.LibraryOrder, arranged.LibraryOrder) {
		t.Errorf("after saving the series colors %+v, want the canvas, the library order and the sources untouched", got)
	}
}

func TestSaveKeepsTheSeriesColorsAndWritesAnAbsentListAsEmpty(t *testing.T) {
	store := openStore(t, "")
	colored := analysisFixture("a1", "colored")
	colored.SeriesColors = []analysisDomain.SeriesColor{{SeriesID: "s2", Label: "runtime_heap_objects", Color: "#aabbcc"}}
	uncolored := analysisFixture("a2", "uncolored")

	for _, analysis := range []analysisDomain.Analysis{colored, uncolored} {
		if err := store.Save(context.Background(), analysis); err != nil {
			t.Fatalf("save %q: %v", analysis.ID, err)
		}
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if !reflect.DeepEqual(stored[0].SeriesColors, colored.SeriesColors) {
		t.Errorf("series colors = %+v, want %+v", stored[0].SeriesColors, colored.SeriesColors)
	}

	if stored[1].SeriesColors == nil || len(stored[1].SeriesColors) != 0 {
		t.Errorf("series colors = %#v, want an empty, non-nil list", stored[1].SeriesColors)
	}
}

func TestOpenStoreAddsTheSeriesColorsToALibraryThatAlreadyKeptALibraryOrder(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "analyses.db")

	earlier, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatalf("open earlier database: %v", err)
	}

	_, err = earlier.Exec(`
		CREATE TABLE analyses (id TEXT PRIMARY KEY, name TEXT NOT NULL, chart_count INTEGER NOT NULL, canvas TEXT NOT NULL DEFAULT '[]',
		                       library_order TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, last_accessed INTEGER NOT NULL);
		INSERT INTO analyses (id, name, chart_count, canvas, library_order, created_at, last_accessed)
		VALUES ('a1', 'with a library order', 0, '[]', '[{"seriesId":"s3","label":"system_cpu_user"}]', 0, 0);`)
	if err != nil {
		t.Fatalf("write earlier library: %v", err)
	}
	_ = earlier.Close()

	store, err := analysisInfra.OpenStore(context.Background(), databasePath, "")
	if err != nil {
		t.Fatalf("open store over an earlier library: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	got, err := store.Get(context.Background(), "a1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if len(got.LibraryOrder) != 1 || got.LibraryOrder[0].Label != "system_cpu_user" || got.SeriesColors == nil || len(got.SeriesColors) != 0 {
		t.Fatalf("earlier library read back as %+v, want its library order kept and every series in its default color", got)
	}

	if err := store.SaveSeriesColors(context.Background(), "a1", []analysisDomain.SeriesColor{{SeriesID: "s0", Label: "runtime_goroutines", Color: "#aabbcc"}}); err != nil {
		t.Fatalf("save series colors into the migrated library: %v", err)
	}
}

func TestTouchRenameSaveCanvasSaveLibraryOrderSaveSeriesColorsAndDeleteReportAnIdentifierTheLibraryDoesNotHold(t *testing.T) {
	store := openStore(t, "")

	if err := store.Touch(context.Background(), "missing", time.Now()); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("touch err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}

	if err := store.Delete(context.Background(), "missing"); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("delete err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}

	if err := store.Rename(context.Background(), "missing", "Capacity"); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("rename err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}

	if err := store.SaveCanvas(context.Background(), "missing", nil); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("save canvas err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}

	if err := store.SaveLibraryOrder(context.Background(), "missing", nil); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("save library order err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}

	if err := store.SaveSeriesColors(context.Background(), "missing", nil); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("save series colors err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}

	if _, err := store.AddSources(context.Background(), "missing", nil); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("add sources err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestAddSourcesAppendsAfterTheListedSourcesAndLeavesTheRestAlone(t *testing.T) {
	store := openStore(t, "")
	saved := analysisFixture("a1", "Capacity")
	if err := store.Save(context.Background(), saved); err != nil {
		t.Fatalf("save: %v", err)
	}

	added := []analysisDomain.SourceFile{{Name: "atlas_cache.rrd", Path: "/sources/atlas_cache.rrd", Size: 512}}
	if written, err := store.AddSources(context.Background(), "a1", added); err != nil || !reflect.DeepEqual(written, added) {
		t.Fatalf("add sources = %+v, %v; want the one new file reported as added", written, err)
	}

	got, err := store.Get(context.Background(), "a1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if want := append(slices.Clone(saved.Files), added...); !reflect.DeepEqual(got.Files, want) {
		t.Errorf("files = %+v, want %+v", got.Files, want)
	}

	if !reflect.DeepEqual(got.Canvas, saved.Canvas) || got.Name != saved.Name {
		t.Errorf("analysis = %+v, want only the sources changed", got)
	}
}

// The caller filters what is new before it reads the files, and a second request can add the same
// file while it does. So the store is handed a file it already lists exactly when two adds race.
func TestAddSources_AFileAnotherRequestAddedMeanwhile_IsListedOnceAndReportedAsNotAdded(t *testing.T) {
	store := openStore(t, "")
	saved := analysisFixture("a1", "Capacity")
	if err := store.Save(context.Background(), saved); err != nil {
		t.Fatalf("save: %v", err)
	}

	racing := []analysisDomain.SourceFile{
		{Name: "atlas_cache.rrd", Path: "/sources/atlas_cache.rrd", Size: 512},
		{Name: "picked-in-a-browser.rrd"},
	}

	if _, err := store.AddSources(context.Background(), "a1", racing); err != nil {
		t.Fatalf("first add: %v", err)
	}

	second, err := store.AddSources(context.Background(), "a1", append(slices.Clone(racing), analysisDomain.SourceFile{Name: "late.rrd", Path: "/sources/late.rrd"}))
	if err != nil {
		t.Fatalf("second add: %v", err)
	}

	if len(second) != 1 || second[0].Name != "late.rrd" {
		t.Errorf("second add reported %+v, want only the file the first had not added", second)
	}

	got, err := store.Get(context.Background(), "a1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	want := append(slices.Clone(saved.Files), racing...)
	want = append(want, analysisDomain.SourceFile{Name: "late.rrd", Path: "/sources/late.rrd"})

	if !reflect.DeepEqual(got.Files, want) {
		t.Errorf("files = %+v, want %+v with no file listed twice", got.Files, want)
	}
}

func TestList_AnalysesOpenedAtDifferentMoments_ComeMostRecentlyOpenedFirst(t *testing.T) {
	store := openStore(t, "")
	created := time.UnixMilli(1_788_026_400_000)

	for _, id := range []string{"oldest", "middle", "newest"} {
		analysis := analysisFixture(id, id)
		analysis.CreatedAt, analysis.LastAccessed = created, created

		if err := store.Save(context.Background(), analysis); err != nil {
			t.Fatalf("save %q: %v", id, err)
		}
	}

	if err := store.Touch(context.Background(), "newest", created.Add(time.Hour)); err != nil {
		t.Fatalf("touch: %v", err)
	}

	stored, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	listed := make([]string, 0, len(stored))
	for _, analysis := range stored {
		listed = append(listed, analysis.ID)
	}

	if want := []string{"newest", "oldest", "middle"}; !reflect.DeepEqual(listed, want) {
		t.Errorf("listed %v, want %v: the one just opened first, then the rest in the order they were created", listed, want)
	}
}
