package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

var sharedSource = analysisDomain.SourceFile{Name: "cpu.rrd", Path: "memory:/1/cpu.rrd", Size: 3}

// sharingLibraryOver is a sharing library over a store a test can make fail, holding one analysis
// created over one source.
func sharingLibraryOver(t *testing.T) (*analysisUsecase.SharingLibrary, *failingStore, string) {
	t.Helper()

	store := &failingStore{memoryStore: &memoryStore{}}
	library := analysisUsecase.NewSharingLibrary(analysisUsecase.NewService(store, &twoPointLoader{}, fixedClock{}))

	analysisID, err := library.Create(context.Background(), "Checkout", []analysisDomain.SourceFile{sharedSource})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	return library, store, analysisID
}

func TestSharingLibrary_Arrange_GivesTheAnalysisTheOwnersArrangement(t *testing.T) {
	library, _, analysisID := sharingLibraryOver(t)
	arrangement := sharingDomain.Arrangement{
		Name:         "Checkout, as shared",
		Canvas:       []analysisDomain.CanvasChart{{SeriesID: "s0", Label: "cpu", Merged: []analysisDomain.MergedSeries{}}},
		LibraryOrder: []analysisDomain.ChartReference{{SeriesID: "s0", Label: "cpu"}},
		SeriesColors: []analysisDomain.SeriesColor{{SeriesID: "s0", Label: "cpu", Color: "#AABBCC"}, {SeriesID: "s1", Label: "memory", Color: ""}},
	}

	if err := library.Arrange(context.Background(), analysisID, arrangement); err != nil {
		t.Fatalf("arrange: %v", err)
	}

	arranged, err := library.Analysis(context.Background(), analysisID)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}

	wantColors := []analysisDomain.SeriesColor{{SeriesID: "s0", Label: "cpu", Color: "#aabbcc"}}
	if arranged.Name != arrangement.Name || !reflect.DeepEqual(arranged.Canvas, arrangement.Canvas) ||
		!reflect.DeepEqual(arranged.LibraryOrder, arrangement.LibraryOrder) || !reflect.DeepEqual(arranged.SeriesColors, wantColors) {
		t.Errorf("arranged = %+v, want the owner's name, canvas and order, and the colors normalised without the default one", arranged)
	}
}

func TestSharingLibrary_Arrange_AnArrangementTheRulesRefuse_IsReported(t *testing.T) {
	fullChart := analysisDomain.CanvasChart{SeriesID: "s0", Label: "cpu", Merged: make([]analysisDomain.MergedSeries, analysisDomain.MaximumChartSeries)}

	tests := []struct {
		name            string
		giveArrangement sharingDomain.Arrangement
		giveFailing     storeOperation
		wantErr         error
	}{
		{name: "a blank name", giveArrangement: sharingDomain.Arrangement{Name: "  "}, wantErr: analysisDomain.ErrNameEmpty},
		{name: "a chart over five series", giveArrangement: sharingDomain.Arrangement{Name: "Checkout", Canvas: []analysisDomain.CanvasChart{fullChart}}, wantErr: analysisDomain.ErrChartFull},
		{name: "the order not stored", giveArrangement: sharingDomain.Arrangement{Name: "Checkout"}, giveFailing: saveLibraryOrderOperation, wantErr: errStoreUnavailable},
		{name: "a color not written #rrggbb", giveArrangement: sharingDomain.Arrangement{
			Name: "Checkout", SeriesColors: []analysisDomain.SeriesColor{{SeriesID: "s0", Label: "cpu", Color: "red"}},
		}, wantErr: analysisDomain.ErrColorInvalid},
		{name: "the colors not stored", giveArrangement: sharingDomain.Arrangement{Name: "Checkout"}, giveFailing: saveSeriesColorsOperation, wantErr: errStoreUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			library, store, analysisID := sharingLibraryOver(t)
			store.failing = tt.giveFailing

			if err := library.Arrange(context.Background(), analysisID, tt.giveArrangement); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestSharingLibrary_Arrange_AnAnalysisThatIsGone_IsNotFound(t *testing.T) {
	library, _, _ := sharingLibraryOver(t)

	if err := library.Arrange(context.Background(), "gone", sharingDomain.Arrangement{Name: "Checkout"}); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestSharingLibrary_CreateAddAndDelete_GoThroughTheLibrarysRules(t *testing.T) {
	library, store, analysisID := sharingLibraryOver(t)
	added := analysisDomain.SourceFile{Name: "memory.rrd", Path: "memory:/2/memory.rrd", Size: 3}

	if _, err := library.Create(context.Background(), "Empty", nil); !errors.Is(err, analysisDomain.ErrNoSources) {
		t.Errorf("create with no sources = %v, want %v", err, analysisDomain.ErrNoSources)
	}

	if err := library.AddSources(context.Background(), analysisID, []analysisDomain.SourceFile{added}); err != nil {
		t.Fatalf("add sources: %v", err)
	}

	grown, _ := library.Analysis(context.Background(), analysisID)
	if !reflect.DeepEqual(grown.Files, []analysisDomain.SourceFile{sharedSource, added}) {
		t.Errorf("files = %+v, want the added source after the first", grown.Files)
	}

	store.failing = deleteOperation
	if err := library.Delete(context.Background(), analysisID); !errors.Is(err, errStoreUnavailable) {
		t.Errorf("delete = %v, want %v", err, errStoreUnavailable)
	}

	store.failing = 0
	if err := library.Delete(context.Background(), analysisID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if _, err := library.Analysis(context.Background(), analysisID); !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Errorf("read after delete = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestNewSharingLibrary_NoAnalysisService_Panics(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("construction went through, want a panic naming the missing service")
		}
	}()

	analysisUsecase.NewSharingLibrary(nil)
}
