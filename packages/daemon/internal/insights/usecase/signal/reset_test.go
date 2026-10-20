package signal_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestResets_MonotoneSeriesFallingBack_IsAResetAcrossHoles(t *testing.T) {
	tests := []struct {
		name     string
		give     []float64
		searched signal.Range
		want     []span
	}{
		{name: "uptime restarts after a hole", give: []float64{100, 200, 300, hole, 5, 10}, searched: signal.Range{From: 0, Until: 5}, want: []span{{onset: 2, end: 4, from: 2, until: 4}}},
		{name: "monotone", give: []float64{1, 2, 3}, searched: signal.Range{From: 0, Until: 2}},
		{name: "zero never resets", give: []float64{0, 0}, searched: signal.Range{From: 0, Until: 1}},
		{name: "all holes", give: holes(4), searched: signal.Range{From: 0, Until: 3}},
		{name: "outside the slice", give: []float64{3, 1}, searched: signal.Range{From: 5, Until: 8}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.Resets(tt.give, tt.searched, signal.DefaultResetDropFraction)
			if len(got) != len(tt.want) {
				t.Fatalf("Resets = %+v, want %+v", got, tt.want)
			}

			for index, episode := range got {
				if spanOf(episode) != tt.want[index] || episode.Direction != domain.DirectionReset || episode.Base != 300 || episode.Peak != 5 || episode.ChangePoint != 4 {
					t.Errorf("episode %d = %+v, want %+v from 300 to 5 resetting at 4", index, episode, tt.want[index])
				}
			}
		})
	}
}

func TestResets_RestartSmearedAcrossTwoBuckets_IsOneResetFromTheLastUptimeToTheFirstAfterIt(t *testing.T) {
	got := signal.Resets([]float64{100, 200, 300, 120, 5, 10, 4}, signal.Range{From: 0, Until: 6}, signal.DefaultResetDropFraction)

	if len(got) != 2 {
		t.Fatalf("Resets = %+v, want the smeared restart and the later one", got)
	}

	if spanOf(got[0]) != (span{onset: 2, end: 4, from: 2, until: 4}) || got[0].Base != 300 || got[0].Peak != 5 || got[0].ChangePoint != 3 {
		t.Errorf("smeared restart = %+v, want 2..4 from 300 to 5 changing at 3", got[0])
	}

	if spanOf(got[1]) != (span{onset: 5, end: 6, from: 5, until: 6}) {
		t.Errorf("later restart = %+v, want 5..6", got[1])
	}
}
