package signal_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestFlats_ReadingsThatDoNotMove_AreEpisodesThatStepsAndHolesEnd(t *testing.T) {
	tests := []struct {
		name      string
		give      []float64
		searched  signal.Range
		want      []span
		wantLevel float64
	}{
		{name: "stuck reading with rounding noise", give: []float64{57.9999999999, 58.0000000001, 58, 58, 58.2}, searched: signal.Range{From: 0, Until: 4}, want: []span{{onset: 0, end: 4, from: 0, until: 4}}, wantLevel: 58},
		{name: "a step starts a new run", give: []float64{57, 57, 57, 58, 58, 58}, searched: signal.Range{From: 0, Until: 5}, want: []span{{onset: 0, end: 2, from: 0, until: 2}, {onset: 3, end: 5, from: 3, until: 5}}, wantLevel: 58},
		{name: "zeros allow no movement", give: []float64{0, 0, 0, 0.001, 0, 0, 0}, searched: signal.Range{From: 0, Until: 6}, want: []span{{onset: 0, end: 2, from: 0, until: 2}, {onset: 4, end: 6, from: 4, until: 6}}},
		{name: "a hole ends a run", give: []float64{5, 5, hole, 5, 5, 5}, searched: signal.Range{From: 0, Until: 5}, want: []span{{onset: 3, end: 5, from: 3, until: 5}}, wantLevel: 5},
		{name: "a moving series", give: []float64{1, 2, 3, 4, 5, 6}, searched: signal.Range{From: 0, Until: 5}},
		{name: "outside the slice", give: []float64{1, 1}, searched: signal.Range{From: 5, Until: 8}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.Flats(tt.give, tt.searched, signal.FlatParameters{Tolerance: signal.DefaultFlatTolerance, MinimumSamples: 3})
			if len(got) != len(tt.want) {
				t.Fatalf("Flats = %+v, want %+v", got, tt.want)
			}

			for index, episode := range got {
				if spanOf(episode) != tt.want[index] || episode.Direction != domain.DirectionFlat {
					t.Errorf("episode %d = %+v, want a flat run %+v", index, episode, tt.want[index])
				}
			}

			if last := len(got) - 1; last >= 0 && (got[last].Base != tt.wantLevel || got[last].Peak != tt.wantLevel) {
				t.Errorf("level = %v to %v, want the run's median %v", got[last].Base, got[last].Peak, tt.wantLevel)
			}
		})
	}
}
