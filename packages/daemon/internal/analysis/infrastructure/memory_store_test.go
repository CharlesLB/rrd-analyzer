package infrastructure_test

import (
	"context"
	"errors"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

var memoryEpoch = time.Date(2026, time.October, 1, 12, 0, 0, 0, time.UTC)

func keptAnalysis(id string, accessedMinutesAfterEpoch int) analysisDomain.Analysis {
	return analysisDomain.Analysis{
		ID:           id,
		Name:         "analysis " + id,
		Files:        []analysisDomain.SourceFile{{Name: id + ".rrd", Path: "memory:/1/" + id + ".rrd", Size: 10}},
		Canvas:       []analysisDomain.CanvasChart{{SeriesID: "s0", Label: "cpu", Merged: []analysisDomain.MergedSeries{{SeriesID: "s1", Label: "memory"}}}},
		CreatedAt:    memoryEpoch,
		LastAccessed: memoryEpoch.Add(time.Duration(accessedMinutesAfterEpoch) * time.Minute),
	}
}

func savedIn(t *testing.T, analyses ...analysisDomain.Analysis) *analysisInfra.MemoryStore {
	t.Helper()

	store := analysisInfra.NewMemoryStore()

	for _, analysis := range analyses {
		if err := store.Save(context.Background(), analysis); err != nil {
			t.Fatalf("save %q: %v", analysis.ID, err)
		}
	}

	return store
}

func TestMemoryStoreListsTheAnalysisOpenedLastFirstAndTiesInTheOrderTheyWereCreated(t *testing.T) {
	store := savedIn(t, keptAnalysis("a", 1), keptAnalysis("b", 5), keptAnalysis("c", 1))

	listed, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	got := make([]string, 0, len(listed))
	for _, analysis := range listed {
		got = append(got, analysis.ID)
	}

	if len(got) != 3 || got[0] != "b" || got[1] != "a" || got[2] != "c" {
		t.Fatalf("want [b a c], got %v", got)
	}
}

func TestMemoryStoreKeepsTheCreationTimeOfAnAnalysisSavedAgain(t *testing.T) {
	store := savedIn(t, keptAnalysis("a", 1))
	resaved := keptAnalysis("a", 9)
	resaved.CreatedAt = memoryEpoch.Add(time.Hour)
	resaved.Name = "renamed"

	if err := store.Save(context.Background(), resaved); err != nil {
		t.Fatalf("save again: %v", err)
	}

	got, err := store.Get(context.Background(), "a")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if !got.CreatedAt.Equal(memoryEpoch) || got.Name != "renamed" {
		t.Fatalf("want the first creation time and the new name, got %v %q", got.CreatedAt, got.Name)
	}
}

func TestMemoryStoreAddsOnlyTheSourcesTheAnalysisDoesNotListYet(t *testing.T) {
	store := savedIn(t, keptAnalysis("a", 1))
	requested := []analysisDomain.SourceFile{
		{Name: "a.rrd", Path: "memory:/1/a.rrd", Size: 10},
		{Name: "b.rrd", Path: "memory:/2/b.rrd", Size: 20},
	}

	added, err := store.AddSources(context.Background(), "a", requested)
	if err != nil {
		t.Fatalf("add sources: %v", err)
	}

	got, err := store.Get(context.Background(), "a")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if len(added) != 1 || added[0].Name != "b.rrd" || len(got.Files) != 2 {
		t.Fatalf("want b.rrd added and two files listed, got %v and %v", added, got.Files)
	}
}

func TestMemoryStoreAppliesEveryWriteToTheAnalysisItNames(t *testing.T) {
	store := savedIn(t, keptAnalysis("a", 1))
	ctx := context.Background()
	accessed := memoryEpoch.Add(3 * time.Hour)

	writes := []error{
		store.Touch(ctx, "a", accessed),
		store.Rename(ctx, "a", "capacity"),
		store.SaveCanvas(ctx, "a", []analysisDomain.CanvasChart{{SeriesID: "s3", Label: "cpu_user"}}),
		store.SaveLibraryOrder(ctx, "a", []analysisDomain.ChartReference{{SeriesID: "s1", Label: "memory"}}),
		store.SaveSeriesColors(ctx, "a", []analysisDomain.SeriesColor{{SeriesID: "s1", Label: "memory", Color: "#005581"}}),
	}

	if err := errors.Join(writes...); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := store.Get(ctx, "a")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if !got.LastAccessed.Equal(accessed) || got.Name != "capacity" || got.Canvas[0].SeriesID != "s3" ||
		got.LibraryOrder[0].SeriesID != "s1" || got.SeriesColors[0].Color != "#005581" {
		t.Fatalf("want every write applied, got %+v", got)
	}
}

func TestMemoryStoreReportsAnAnalysisItDoesNotHold(t *testing.T) {
	store := analysisInfra.NewMemoryStore()
	ctx := context.Background()

	_, getErr := store.Get(ctx, "missing")
	_, addErr := store.AddSources(ctx, "missing", nil)

	failures := []error{
		getErr,
		addErr,
		store.Touch(ctx, "missing", memoryEpoch),
		store.Rename(ctx, "missing", "name"),
		store.SaveCanvas(ctx, "missing", nil),
		store.SaveLibraryOrder(ctx, "missing", nil),
		store.SaveSeriesColors(ctx, "missing", nil),
		store.Delete(ctx, "missing"),
	}

	for index, err := range failures {
		if !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
			t.Fatalf("call %d: want ErrAnalysisNotFound, got %v", index, err)
		}
	}
}

func TestMemoryStoreForgetsADeletedAnalysis(t *testing.T) {
	store := savedIn(t, keptAnalysis("a", 1))

	if err := store.Delete(context.Background(), "a"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	listed, err := store.List(context.Background())
	if err != nil || len(listed) != 0 {
		t.Fatalf("want an empty library, got %v %v", listed, err)
	}
}

func TestMemoryStoreHandsOutCopiesSoNoCallerChangesWhatItKeeps(t *testing.T) {
	store := savedIn(t, keptAnalysis("a", 1))

	got, err := store.Get(context.Background(), "a")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	got.Files[0].Name = "changed.rrd"
	got.Canvas[0].Merged[0].Label = "changed"

	again, err := store.Get(context.Background(), "a")
	if err != nil {
		t.Fatalf("get again: %v", err)
	}

	if again.Files[0].Name != "a.rrd" || again.Canvas[0].Merged[0].Label != "memory" {
		t.Fatalf("want the kept analysis unchanged, got %+v", again)
	}
}

func TestMemoryStoreReadsAnAbsentListAsAnEmptyOneTheWayTheSQLiteStoreDoes(t *testing.T) {
	analysis := keptAnalysis("a", 1)
	analysis.Canvas = []analysisDomain.CanvasChart{{SeriesID: "s0", Label: "cpu"}}
	store := savedIn(t, analysis)

	got, err := store.Get(context.Background(), "a")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	if got.Canvas[0].Merged == nil || got.LibraryOrder == nil || got.SeriesColors == nil {
		t.Fatalf("want empty lists rather than absent ones, got %+v", got)
	}
}

func TestMemoryStore_ACallerThatHasGone_IsRefusedByEveryCall(t *testing.T) {
	store := savedIn(t, keptAnalysis("a", 1))
	gone, leave := context.WithCancel(context.Background())
	leave()

	tests := []struct {
		name     string
		giveCall func(callerContext context.Context) error
	}{
		{name: "list", giveCall: func(callerContext context.Context) error {
			_, err := store.List(callerContext)

			return err
		}},
		{name: "get", giveCall: func(callerContext context.Context) error {
			_, err := store.Get(callerContext, "a")

			return err
		}},
		{name: "save", giveCall: func(callerContext context.Context) error {
			return store.Save(callerContext, keptAnalysis("b", 2))
		}},
		{name: "touch", giveCall: func(callerContext context.Context) error {
			return store.Touch(callerContext, "a", memoryEpoch)
		}},
		{name: "add sources", giveCall: func(callerContext context.Context) error {
			_, err := store.AddSources(callerContext, "a", nil)

			return err
		}},
		{name: "delete", giveCall: func(callerContext context.Context) error {
			return store.Delete(callerContext, "a")
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.giveCall(gone); !errors.Is(err, context.Canceled) {
				t.Fatalf("err = %v, want %v", err, context.Canceled)
			}
		})
	}
}
