package signal_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestThresholds_RunsBeyondTheLevel_AreEpisodesThatHolesInterrupt(t *testing.T) {
	values := []float64{1, 5, 6, hole, 7, 1, 8}
	whole := signal.Range{From: 0, Until: 6}

	tests := []struct {
		name           string
		comparison     domain.Comparison
		level          float64
		minimumSamples int
		searched       signal.Range
		want           []span
		wantPeaks      []float64
		wantDirection  domain.Direction
	}{
		{name: "above, every run", comparison: domain.ComparisonAbove, level: 4, minimumSamples: 1, searched: whole,
			want:      []span{{onset: 1, end: 2, from: 1, until: 2}, {onset: 4, end: 4, from: 4, until: 4}, {onset: 6, end: 6, from: 6, until: 6}},
			wantPeaks: []float64{6, 7, 8}, wantDirection: domain.DirectionRising},
		{name: "above, at least two samples", comparison: domain.ComparisonAbove, level: 4, minimumSamples: 2, searched: whole,
			want: []span{{onset: 1, end: 2, from: 1, until: 2}}, wantPeaks: []float64{6}, wantDirection: domain.DirectionRising},
		{name: "below", comparison: domain.ComparisonBelow, level: 2, minimumSamples: 0, searched: whole,
			want: []span{{onset: 0, end: 0, from: 0, until: 0}, {onset: 5, end: 5, from: 5, until: 5}}, wantPeaks: []float64{1, 1}, wantDirection: domain.DirectionFalling},
		{name: "outside the slice", comparison: domain.ComparisonAbove, level: 4, minimumSamples: 1, searched: signal.Range{From: 9, Until: 12}},
		{name: "all holes", comparison: domain.ComparisonAbove, level: 4, minimumSamples: 1, searched: signal.Range{From: 3, Until: 3}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.Thresholds(values, tt.searched, signal.ThresholdParameters{Comparison: tt.comparison, Level: tt.level, MinimumSamples: tt.minimumSamples})
			if len(got) != len(tt.want) {
				t.Fatalf("Thresholds = %+v, want %+v", got, tt.want)
			}

			for index, episode := range got {
				if spanOf(episode) != tt.want[index] || episode.Peak != tt.wantPeaks[index] || episode.Direction != tt.wantDirection {
					t.Errorf("episode %d = %+v, want %+v peaking at %v %s", index, episode, tt.want[index], tt.wantPeaks[index], tt.wantDirection)
				}
			}
		})
	}
}

func TestThresholds_FirstRun_CarriesEntryValueAndMean(t *testing.T) {
	got := signal.Thresholds([]float64{1, 5, 6, hole, 7, 1, 8}, signal.Range{From: 0, Until: 6}, signal.ThresholdParameters{Comparison: domain.ComparisonAbove, Level: 4, MinimumSamples: 1})

	if got[0].Base != 5 || got[0].Mean != 5.5 || got[0].Pronounced {
		t.Errorf("first run = %+v, want base 5, mean 5.5, not pronounced", got[0])
	}

	if !got[2].Pronounced {
		t.Errorf("last run = %+v, want a peak of 8 against a level of 4 to be pronounced", got[2])
	}
}
