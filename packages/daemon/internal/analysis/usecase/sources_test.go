package usecase_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

var errUnreadableSource = errors.New("unreadable source")

// fileLoader holds one series per file, named after it, and refuses a file named "broken.rrd".
type fileLoader struct{}

func (fileLoader) Load(_ context.Context, files []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	series := make([]seriesDomain.Series, 0, len(files))
	for _, file := range files {
		if file.Name == "broken.rrd" {
			return nil, errUnreadableSource
		}

		series = append(series, seriesDomain.Series{
			Name:             file.Name,
			Label:            file.Name,
			StepMilliseconds: 300000,
			Archives: []seriesDomain.Archive{{
				Function:         seriesDomain.ConsolidationAverage,
				StepMilliseconds: 300000,
				Samples:          []seriesDomain.Sample{seriesDomain.Known(1)},
			}},
		})
	}

	return series, nil
}

func labelsOfBundle(t *testing.T, bundle seriesDomain.Bundle) []string {
	t.Helper()

	labels := make([]string, 0, len(bundle.Series))
	for _, series := range bundle.Series {
		labels = append(labels, series.ID+"="+series.Label)
	}

	return labels
}

func TestAddSources_NewFiles_AreReadAfterTheOnesTheAnalysisHadWhoseSeriesKeepTheirIdentifiers(t *testing.T) {
	service, _ := newService(fileLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}})
	before, _ := service.Bundle(context.Background(), created.ID)

	added, err := service.AddSources(context.Background(), created.ID, []analysisDomain.SourceFile{
		{Name: "memory.rrd", Path: "/data/memory.rrd"},
		{Name: "cpu.rrd", Path: "/data/cpu.rrd"},
		{Name: "memory.rrd", Path: "/data/memory.rrd"},
	})
	if err != nil {
		t.Fatalf("add sources: %v", err)
	}

	after, _ := service.Bundle(context.Background(), created.ID)

	if added.Added != 1 || len(added.Analysis.Files) != 2 {
		t.Errorf("added %d, files %+v; want one new file, the listed and repeated ones skipped", added.Added, added.Analysis.Files)
	}

	if got, want := labelsOfBundle(t, after), []string{"s0=cpu.rrd", "s1=memory.rrd"}; len(before.Series) != 1 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("series after adding = %q, want %q read afresh, the old series first", got, want)
	}
}

func TestAddSources_OnlyFilesItAlreadyHolds_AddsNothing(t *testing.T) {
	service, _ := newService(fileLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "cpu.rrd"}})

	added, err := service.AddSources(context.Background(), created.ID, []analysisDomain.SourceFile{{Name: "cpu.rrd"}})
	if err != nil || added.Added != 0 || len(added.Analysis.Files) != 1 {
		t.Fatalf("add = %+v, %v; want nothing added and no error", added, err)
	}
}

func TestAddSources_RefusesWhatItCannotAdd(t *testing.T) {
	service, store := newService(fileLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "cpu.rrd"}})

	tests := []struct {
		name      string
		giveID    string
		giveFiles []analysisDomain.SourceFile
		wantErrIs error
	}{
		{name: "no files", giveID: created.ID, wantErrIs: analysisDomain.ErrNoSources},
		{name: "a missing analysis", giveID: "missing", giveFiles: []analysisDomain.SourceFile{{Name: "a.rrd"}}, wantErrIs: analysisDomain.ErrAnalysisNotFound},
		{name: "an unreadable file", giveID: created.ID, giveFiles: []analysisDomain.SourceFile{{Name: "broken.rrd"}}, wantErrIs: errUnreadableSource},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := service.AddSources(context.Background(), tt.giveID, tt.giveFiles); !errors.Is(err, tt.wantErrIs) {
				t.Errorf("err = %v, want %v", err, tt.wantErrIs)
			}
		})
	}

	if stored, _ := store.Get(context.Background(), created.ID); len(stored.Files) != 1 {
		t.Errorf("stored files = %+v, want the refused file never kept", stored.Files)
	}
}

// recordingLoader reads the way fileLoader does and keeps the names of the files of every read.
type recordingLoader struct {
	fileLoader

	reads [][]string
}

func (loader *recordingLoader) Load(callerContext context.Context, files []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	names := make([]string, 0, len(files))
	for _, file := range files {
		names = append(names, file.Name)
	}

	loader.reads = append(loader.reads, names)

	return loader.fileLoader.Load(callerContext, files)
}

func sourcesNamed(names ...string) []analysisDomain.SourceFile {
	files := make([]analysisDomain.SourceFile, 0, len(names))
	for _, name := range names {
		files = append(files, analysisDomain.SourceFile{Name: name, Path: "/data/" + name})
	}

	return files
}

func TestAddSources_ToAnAnalysisAlreadyRead_ReadsOnlyTheNewFilesOnceAndHoldsWhatAFreshReadWould(t *testing.T) {
	loader := &recordingLoader{}
	store := &memoryStore{}
	service := analysisUsecase.NewService(store, loader, fixedClock{})

	created, _ := service.Create(context.Background(), "Capacity", sourcesNamed("cpu.rrd", "swap.rrd"))
	if _, err := service.Bundle(context.Background(), created.ID); err != nil {
		t.Fatalf("read before adding: %v", err)
	}

	if _, err := service.AddSources(context.Background(), created.ID, sourcesNamed("memory.rrd", "disk.rrd")); err != nil {
		t.Fatalf("first addition: %v", err)
	}

	if _, err := service.AddSources(context.Background(), created.ID, sourcesNamed("network.rrd")); err != nil {
		t.Fatalf("second addition: %v", err)
	}

	extended, err := service.Bundle(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("read after adding: %v", err)
	}

	wantReads := [][]string{{"cpu.rrd", "swap.rrd"}, {"memory.rrd", "disk.rrd"}, {"network.rrd"}}
	if !reflect.DeepEqual(loader.reads, wantReads) {
		t.Errorf("files read = %v, want %v: each file once, and none of the ones already held again", loader.reads, wantReads)
	}

	fresh, err := analysisUsecase.NewService(store, fileLoader{}, fixedClock{}).Bundle(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("fresh read: %v", err)
	}

	if !reflect.DeepEqual(extended, fresh) {
		t.Errorf("series after adding = %q, want exactly what reading every file afresh holds, %q", labelsOfBundle(t, extended), labelsOfBundle(t, fresh))
	}
}

// overtakenStore lists another file under an analysis just before each addition is written, the
// way a second request landing first would.
type overtakenStore struct {
	*memoryStore

	overtaking analysisDomain.SourceFile
}

func (store *overtakenStore) AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) ([]analysisDomain.SourceFile, error) {
	if _, err := store.memoryStore.AddSources(callerContext, analysisID, []analysisDomain.SourceFile{store.overtaking}); err != nil {
		return nil, err
	}

	return store.memoryStore.AddSources(callerContext, analysisID, files)
}

func TestAddSources_OvertakenByAnotherAddition_ReadsAfreshRatherThanMisplaceTheSeries(t *testing.T) {
	store := &overtakenStore{memoryStore: &memoryStore{}, overtaking: sourcesNamed("overtaking.rrd")[0]}
	service := analysisUsecase.NewService(store, fileLoader{}, fixedClock{})

	created, _ := service.Create(context.Background(), "Capacity", sourcesNamed("cpu.rrd"))
	_, _ = service.Bundle(context.Background(), created.ID)

	if _, err := service.AddSources(context.Background(), created.ID, sourcesNamed("memory.rrd")); err != nil {
		t.Fatalf("add sources: %v", err)
	}

	after, _ := service.Bundle(context.Background(), created.ID)

	want := []string{"s0=cpu.rrd", "s1=overtaking.rrd", "s2=memory.rrd"}
	if got := labelsOfBundle(t, after); !reflect.DeepEqual(got, want) {
		t.Errorf("series = %q, want %q in the order the store lists the files", got, want)
	}
}

// sharedOutLoader stands in for sources with no path the way the development server does: what it
// hands back depends on how many files it is given together, not on each file alone.
type sharedOutLoader struct{}

func (sharedOutLoader) Load(_ context.Context, files []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	label := fmt.Sprintf("shared out over %d", len(files))

	return []seriesDomain.Series{{Name: label, Label: label}}, nil
}

func TestAddSources_ToSourcesWithNoPath_ReadsThemAfreshSinceWhatStandsInForThemDependsOnThemAll(t *testing.T) {
	service, _ := newService(sharedOutLoader{})
	created, _ := service.Create(context.Background(), "Picked in a browser", []analysisDomain.SourceFile{{Name: "cpu.rrd"}})
	_, _ = service.Bundle(context.Background(), created.ID)

	if _, err := service.AddSources(context.Background(), created.ID, []analysisDomain.SourceFile{{Name: "memory.rrd"}}); err != nil {
		t.Fatalf("add sources: %v", err)
	}

	after, _ := service.Bundle(context.Background(), created.ID)

	if got, want := labelsOfBundle(t, after), []string{"s0=shared out over 2"}; !reflect.DeepEqual(got, want) {
		t.Errorf("series = %q, want %q", got, want)
	}
}

// deletedMeanwhileStore writes each addition and then loses the analysis, the way a delete landing
// between the addition and the read that follows it would.
type deletedMeanwhileStore struct {
	*memoryStore
}

func (store *deletedMeanwhileStore) AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) ([]analysisDomain.SourceFile, error) {
	added, err := store.memoryStore.AddSources(callerContext, analysisID, files)
	if err != nil {
		return nil, err
	}

	return added, store.Delete(callerContext, analysisID)
}

func TestAddSources_AnAnalysisDeletedOnceTheFilesWereAdded_IsReportedAsNotFound(t *testing.T) {
	service := analysisUsecase.NewService(&deletedMeanwhileStore{memoryStore: &memoryStore{}}, fileLoader{}, fixedClock{})
	created, _ := service.Create(context.Background(), "Capacity", sourcesNamed("cpu.rrd"))
	_, _ = service.Bundle(context.Background(), created.ID)

	if _, err := service.AddSources(context.Background(), created.ID, sourcesNamed("memory.rrd")); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}

	if _, err := service.Bundle(context.Background(), created.ID); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("bundle err = %v, want the series held before the addition forgotten along with the analysis", err)
	}
}
