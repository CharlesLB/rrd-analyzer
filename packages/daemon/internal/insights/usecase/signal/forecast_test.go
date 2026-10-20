package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestSamplesToLevel_EpisodePace_ProjectsFromItsLastReadingOrFindsNothing(t *testing.T) {
	tests := []struct {
		name        string
		give        []float64
		giveLevel   float64
		want        float64
		wantReaches bool
	}{
		{name: "climbing towards a higher level", give: []float64{10, 11, 12, 13}, giveLevel: 20, want: 7, wantReaches: true},
		{name: "falling towards a lower level", give: []float64{10, 8, 6}, giveLevel: 0, want: 3, wantReaches: true},
		{name: "already past the level", give: []float64{10, 11, 12}, giveLevel: 11},
		{name: "heading away from the level", give: []float64{10, 9, 8}, giveLevel: 20},
		{name: "not moving", give: []float64{5, 5, 5}, giveLevel: 9},
		{name: "a single reading has no pace", give: []float64{hole, 4, hole}, giveLevel: 9},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			episode := signal.Episode{From: 0, Until: len(tt.give) - 1}

			got, reaches := signal.SamplesToLevel(tt.give, episode, tt.giveLevel)
			if reaches != tt.wantReaches || math.Abs(got-tt.want) > 1e-9 {
				t.Errorf("SamplesToLevel = %v, %v; want %v, %v", got, reaches, tt.want, tt.wantReaches)
			}
		})
	}
}
