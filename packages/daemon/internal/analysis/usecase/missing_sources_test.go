package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"slices"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
)

var errUnsearchableFolder = errors.New("unsearchable folder")

// goneFiles is a disk every path is on except the ones it lists, and cannot look for "/locked".
type goneFiles []string

func (gone goneFiles) Exists(_ context.Context, path string) (bool, error) {
	if path == "/locked" {
		return false, errUnsearchableFolder
	}

	return !slices.Contains(gone, path), nil
}

func newServiceOver(presence analysisDomain.SourcePresence) *analysisUsecase.Service {
	return analysisUsecase.NewService(&memoryStore{}, fileLoader{}, fixedClock{}, analysisUsecase.WithSourcePresence(presence))
}

func TestMissingSources_FilesGoneFromDisk_AreNamedInTheOrderTheAnalysisListsThem(t *testing.T) {
	service := newServiceOver(goneFiles{"/data/memory.rrd", "/data/cpu.rrd"})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{
		{Name: "cpu.rrd", Path: "/data/cpu.rrd"},
		{Name: "disk.rrd", Path: "/data/disk.rrd"},
		{Name: "memory.rrd", Path: "/data/memory.rrd"},
		{Name: "picked-in-a-browser.rrd"},
	})

	missing, err := service.MissingSources(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("missing sources: %v", err)
	}

	want := []analysisDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}, {Name: "memory.rrd", Path: "/data/memory.rrd"}}
	if !reflect.DeepEqual(missing, want) {
		t.Errorf("missing = %+v, want %+v", missing, want)
	}
}

func TestMissingSources_EveryFileOnDisk_IsAnEmptyListAndNeverNil(t *testing.T) {
	service := newServiceOver(goneFiles{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "cpu.rrd", Path: "/data/cpu.rrd"}})

	missing, err := service.MissingSources(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("missing sources: %v", err)
	}

	if missing == nil || len(missing) != 0 {
		t.Errorf("missing = %#v, want an empty list that encodes as []", missing)
	}
}

func TestMissingSources_ADiskThatCannotBeSearched_IsAnErrorRatherThanAFileCalledMissing(t *testing.T) {
	service := newServiceOver(goneFiles{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "cpu.rrd", Path: "/locked"}})

	if _, err := service.MissingSources(context.Background(), created.ID); !errors.Is(err, errUnsearchableFolder) {
		t.Errorf("error = %v, want %v", err, errUnsearchableFolder)
	}
}

func TestMissingSources_AnAnalysisThatDoesNotExist_IsReportedAsNotFound(t *testing.T) {
	if _, err := newServiceOver(goneFiles{}).MissingSources(context.Background(), "nowhere"); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("error = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}
