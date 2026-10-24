package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

func colorsOf(bundle seriesDomain.Bundle) map[string]string {
	colors := make(map[string]string, len(bundle.Series))
	for _, series := range bundle.Series {
		colors[series.Label] = series.Color
	}

	return colors
}

func storedColorsOf(t *testing.T, store *memoryStore, analysisID string) []analysisDomain.SeriesColor {
	t.Helper()

	stored, err := store.Get(context.Background(), analysisID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	return stored.SeriesColors
}

func TestCreateStartsWithEverySeriesInItsDefaultColor(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	created, err := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if created.SeriesColors == nil || len(created.SeriesColors) != 0 {
		t.Errorf("series colors = %#v, want an empty, non-nil list", created.SeriesColors)
	}
}

func TestSaveSeriesColorStoresReplacesAndResetsTheColorOfOneSeries(t *testing.T) {
	tests := []struct {
		name string
		give []analysisDomain.SeriesColor
		want []analysisDomain.SeriesColor
	}{
		{
			name: "a first color, stored in lowercase",
			give: []analysisDomain.SeriesColor{{SeriesID: "s1", Label: "memory", Color: "#AABBCC"}},
			want: []analysisDomain.SeriesColor{{SeriesID: "s1", Label: "memory", Color: "#aabbcc"}},
		},
		{
			name: "a second color for the same series replaces the first",
			give: []analysisDomain.SeriesColor{
				{SeriesID: "s1", Label: "memory", Color: "#aabbcc"},
				{SeriesID: "s0", Label: "cpu", Color: "#112233"},
				{SeriesID: "s1", Label: "memory", Color: "#445566"},
			},
			want: []analysisDomain.SeriesColor{
				{SeriesID: "s0", Label: "cpu", Color: "#112233"},
				{SeriesID: "s1", Label: "memory", Color: "#445566"},
			},
		},
		{
			name: "the default color removes the entry",
			give: []analysisDomain.SeriesColor{
				{SeriesID: "s1", Label: "memory", Color: "#aabbcc"},
				{SeriesID: "s0", Label: "cpu", Color: "#112233"},
				{SeriesID: "s1", Label: "memory", Color: ""},
			},
			want: []analysisDomain.SeriesColor{{SeriesID: "s0", Label: "cpu", Color: "#112233"}},
		},
		{
			name: "two series sharing a label keep a color each",
			give: []analysisDomain.SeriesColor{
				{SeriesID: "s2", Label: "load", Color: "#aabbcc"},
				{SeriesID: "s3", Label: "load", Color: "#112233"},
			},
			want: []analysisDomain.SeriesColor{
				{SeriesID: "s2", Label: "load", Color: "#aabbcc"},
				{SeriesID: "s3", Label: "load", Color: "#112233"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, store := newService(labelledLoader{labels: []string{"cpu", "memory", "load", "load"}})
			created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

			for _, color := range tt.give {
				if err := service.SaveSeriesColor(context.Background(), created.ID, color); err != nil {
					t.Fatalf("save series color %+v: %v", color, err)
				}
			}

			if got := storedColorsOf(t, store, created.ID); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("stored colors = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestSaveSeriesColorReplacesTheColorOfASeriesTheSourcesHaveMoved(t *testing.T) {
	service, store := newService(labelledLoader{labels: []string{"disk", "cpu", "memory"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	savedBeforeDiskWasAdded := []analysisDomain.SeriesColor{{SeriesID: "s0", Label: "cpu", Color: "#aabbcc"}}
	if err := store.SaveSeriesColors(context.Background(), created.ID, savedBeforeDiskWasAdded); err != nil {
		t.Fatalf("seed colors: %v", err)
	}

	if err := service.SaveSeriesColor(context.Background(), created.ID, analysisDomain.SeriesColor{SeriesID: "s1", Label: "cpu", Color: "#112233"}); err != nil {
		t.Fatalf("save series color: %v", err)
	}

	want := []analysisDomain.SeriesColor{{SeriesID: "s1", Label: "cpu", Color: "#112233"}}
	if got := storedColorsOf(t, store, created.ID); !reflect.DeepEqual(got, want) {
		t.Errorf("stored colors = %+v, want %+v: the entry stored at cpu's old position replaced", got, want)
	}
}

func TestSaveSeriesColorRefusesAColorNotWrittenAsSixHexadecimalDigits(t *testing.T) {
	tests := []struct {
		name string
		give string
	}{
		{name: "a color name", give: "teal"},
		{name: "three digits", give: "#abc"},
		{name: "no prefix", give: "aabbccd"},
		{name: "not hexadecimal", give: "#gghhii"},
		{name: "an alpha channel", give: "#aabbccdd"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, store := newService(labelledLoader{labels: []string{"cpu"}})
			created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

			err := service.SaveSeriesColor(context.Background(), created.ID, analysisDomain.SeriesColor{SeriesID: "s0", Label: "cpu", Color: tt.give})
			if !errors.Is(err, analysisDomain.ErrColorInvalid) {
				t.Fatalf("err = %v, want %v", err, analysisDomain.ErrColorInvalid)
			}

			if got := storedColorsOf(t, store, created.ID); len(got) != 0 {
				t.Errorf("stored colors = %+v, want none", got)
			}
		})
	}
}

func TestSaveSeriesColorReportsAMissingAnalysis(t *testing.T) {
	service, _ := newService(&twoPointLoader{})

	err := service.SaveSeriesColor(context.Background(), "missing", analysisDomain.SeriesColor{SeriesID: "s0", Label: "cpu", Color: "#aabbcc"})
	if !errors.Is(err, analysisDomain.ErrAnalysisNotFound) {
		t.Fatalf("err = %v, want %v", err, analysisDomain.ErrAnalysisNotFound)
	}
}

func TestOpenDrawsEachSeriesInTheColorItWasGivenAndPassesOverAStaleEntry(t *testing.T) {
	service, store := newService(labelledLoader{labels: []string{"disk", "cpu", "memory"}})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})
	savedBeforeDiskWasAdded := []analysisDomain.SeriesColor{
		{SeriesID: "s0", Label: "cpu", Color: "#aabbcc"},
		{SeriesID: "s7", Label: "gone", Color: "#112233"},
	}
	if err := store.SaveSeriesColors(context.Background(), created.ID, savedBeforeDiskWasAdded); err != nil {
		t.Fatalf("seed colors: %v", err)
	}

	opened, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	want := map[string]string{"disk": seriesDomain.ColorAt(0), "cpu": "#aabbcc", "memory": seriesDomain.ColorAt(2)}
	if got := colorsOf(opened); !reflect.DeepEqual(got, want) {
		t.Errorf("colors = %v, want %v: cpu in its color where it now sits, the others in their default", got, want)
	}

	shared, err := service.Bundle(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}

	if got := shared.Series[1].Color; got != seriesDomain.ColorAt(1) {
		t.Errorf("cached cpu color = %q, want its default %q: the cache every reader shares is never recolored", got, seriesDomain.ColorAt(1))
	}
}

func TestSaveSeriesColor_SourcesThatCannotBeRead_StoreNoColor(t *testing.T) {
	service, store := newService(fileLoader{})
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "broken.rrd"}})

	err := service.SaveSeriesColor(context.Background(), created.ID, analysisDomain.SeriesColor{SeriesID: "s0", Label: "broken.rrd", Color: "#aabbcc"})
	if !errors.Is(err, errUnreadableSource) {
		t.Fatalf("err = %v, want %v", err, errUnreadableSource)
	}

	if got := storedColorsOf(t, store, created.ID); len(got) != 0 {
		t.Errorf("stored colors = %+v, want none", got)
	}
}
