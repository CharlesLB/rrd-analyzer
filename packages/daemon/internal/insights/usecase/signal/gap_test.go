package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestGaps_RunsOfHoles_BecomeEpisodesEndingWhereReportingCouldResume(t *testing.T) {
	tests := []struct {
		name       string
		give       []float64
		searched   signal.Range
		minimumRun int
		want       []span
	}{
		{name: "two runs, the last reaching the range end", give: []float64{1, hole, hole, hole, 2, hole, hole}, searched: signal.Range{From: 0, Until: 6}, minimumRun: 2,
			want: []span{{onset: 1, end: 4, from: 1, until: 3}, {onset: 5, end: 7, from: 5, until: 6}}},
		{name: "runs shorter than the minimum", give: []float64{1, hole, hole, hole, 2, hole, hole}, searched: signal.Range{From: 0, Until: 6}, minimumRun: 4},
		{name: "all holes", give: holes(8), searched: signal.Range{From: 0, Until: 7}, minimumRun: 6, want: []span{{onset: 0, end: 8, from: 0, until: 7}}},
		{name: "single present sample", give: []float64{5}, searched: signal.Range{From: 0, Until: 0}, minimumRun: 1},
		{name: "range clamped to the slice", give: []float64{hole, hole, 3}, searched: signal.Range{From: -5, Until: 50}, minimumRun: 2, want: []span{{onset: 0, end: 2, from: 0, until: 1}}},
		{name: "range entirely outside the slice", give: []float64{hole, hole}, searched: signal.Range{From: 4, Until: 9}, minimumRun: 1},
		{name: "non-positive minimum counts single holes", give: []float64{1, hole, 1}, searched: signal.Range{From: 0, Until: 2}, minimumRun: 0, want: []span{{onset: 1, end: 2, from: 1, until: 1}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.Gaps(tt.give, tt.searched, tt.minimumRun)
			if len(got) != len(tt.want) {
				t.Fatalf("Gaps = %+v, want %+v", got, tt.want)
			}

			for index, episode := range got {
				if spanOf(episode) != tt.want[index] || episode.Direction != domain.DirectionGap || !math.IsNaN(episode.Base) {
					t.Errorf("episode %d = %+v, want span %+v as a gap", index, episode, tt.want[index])
				}
			}
		})
	}
}

func TestGaps_MagnitudeAndPronounced_FollowTheRunLength(t *testing.T) {
	got := signal.Gaps(holes(12), signal.Range{From: 0, Until: 11}, 6)

	if len(got) != 1 || got[0].Magnitude != 12 || !got[0].Pronounced {
		t.Fatalf("Gaps = %+v, want one pronounced run of magnitude 12", got)
	}
}
