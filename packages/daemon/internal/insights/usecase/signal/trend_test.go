package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/insightstest"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestTrends_SustainedSlope_StartsWhereTheClimbBegan(t *testing.T) {
	tests := []struct {
		name      string
		give      []float64
		direction domain.Direction
		want      span
		wantBase  float64
		wantPeak  float64
	}{
		{name: "rising after a flat stretch", give: insightstest.RampAfter(30, 14, 1), direction: domain.DirectionRising, want: span{onset: 14, end: 29, from: 14, until: 29}, wantBase: 0, wantPeak: 15},
		{name: "falling after a flat stretch", give: insightstest.RampAfter(30, 14, -1), direction: domain.DirectionFalling, want: span{onset: 14, end: 29, from: 14, until: 29}, wantBase: 0, wantPeak: -15},
		{name: "rising from the first sample", give: insightstest.RampAfter(30, -1, 1), direction: domain.DirectionRising, want: span{onset: 0, end: 29, from: 0, until: 29}, wantBase: 1, wantPeak: 30},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.Trends(tt.give, signal.Range{From: 0, Until: len(tt.give) - 1}, signal.TrendParameters{Direction: tt.direction, SmoothingSamples: 6, Theta: 3, Sustain: 3})
			if len(got) != 1 {
				t.Fatalf("Trends = %+v, want one episode", got)
			}

			if spanOf(got[0]) != tt.want || got[0].Base != tt.wantBase || got[0].Peak != tt.wantPeak || got[0].Direction != tt.direction || !got[0].Pronounced {
				t.Errorf("Trends = %+v, want %+v from %v to %v, pronounced %s", got[0], tt.want, tt.wantBase, tt.wantPeak, tt.direction)
			}
		})
	}
}

// noisyClimb is flat through flatUntil, climbs half a unit a sample for climbSamples and is flat
// again, under noise large enough for the slope to dip below its bar now and then.
func noisyClimb(count, flatUntil, climbSamples int) []float64 {
	const noiseAmplitude = 1.7

	values := make([]float64, count)
	for index := range values {
		climbed := min(max(0, index-flatUntil), climbSamples)
		values[index] = 100 + 0.5*float64(climbed) + noiseAmplitude*insightstest.Noise(index)
	}

	return values
}

func negated(values []float64) []float64 {
	turned := make([]float64, len(values))
	for index, value := range values {
		turned[index] = -value
	}

	return turned
}

func TestTrends_OneSteadyClimbUnderNoise_IsOneEpisode(t *testing.T) {
	climb := noisyClimb(1200, 400, 400)

	tests := []struct {
		name      string
		give      []float64
		direction domain.Direction
	}{
		{name: "rising", give: climb, direction: domain.DirectionRising},
		{name: "falling", give: negated(climb), direction: domain.DirectionFalling},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.Trends(tt.give, signal.Range{From: 0, Until: 1199}, signal.TrendParameters{Direction: tt.direction, SmoothingSamples: 6, Theta: 3, Sustain: 3})
			if len(got) != 1 || got[0].From > 420 || got[0].Until < 780 {
				t.Fatalf("Trends = %d episodes %+v, want the one %s stretch from about 400 to about 800", len(got), got, tt.direction)
			}
		})
	}
}

func TestTrends_ClimbBrokenByAHole_IsTwoEpisodes(t *testing.T) {
	values := []float64{0, 1, 2, 3, 4, 5, hole, 7, 8, 9, 10, 11}

	got := signal.Trends(values, signal.Range{From: 0, Until: len(values) - 1}, signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 1, Theta: 3, Sustain: 3})
	if len(got) != 2 || got[0].Until != 5 || got[1].From != 7 {
		t.Errorf("Trends = %+v, want one climb on each side of the hole at 6: a silent stretch is no climb to bridge", got)
	}
}

func TestTrends_ClimbTheSmoothingShowsAfterItsLastReading_IsAnEpisodeOnlyWhenThatReadingIsThere(t *testing.T) {
	parameters := signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 2, Theta: 0.5, Sustain: 1}

	tests := []struct {
		name         string
		give         []float64
		wantEpisodes int
	}{
		{name: "the climb ends on a reading", give: []float64{20, 20, 20, 20, 0, 10, 10, 10}, wantEpisodes: 1},
		{name: "the climb ends on a hole", give: []float64{20, 20, 20, 20, 0, 10, 10, hole}, wantEpisodes: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := signal.Trends(tt.give, signal.Range{From: 0, Until: len(tt.give) - 1}, parameters); len(got) != tt.wantEpisodes {
				t.Errorf("Trends = %+v, want %d episodes: a climb with no reading in it has no base to start from", got, tt.wantEpisodes)
			}
		})
	}
}

func TestTrends_TwoClimbsWithAFallBetween_StayTwoEpisodes(t *testing.T) {
	values := append(insightstest.RampAfter(40, 9, 1), insightstest.RampAfter(40, 9, 1)...)

	got := signal.Trends(values, signal.Range{From: 0, Until: 79}, signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 6, Theta: 3, Sustain: 3})
	if len(got) != 2 || got[0].From >= 40 || got[1].From < 40 {
		t.Errorf("Trends = %+v, want one climb on each side of the fall at 40", got)
	}
}

func TestTrends_NoSustainedSlope_FindsNothing(t *testing.T) {
	flat := stepValues(30, 0, 5, 5)

	tests := []struct {
		name       string
		give       []float64
		searched   signal.Range
		parameters signal.TrendParameters
	}{
		{name: "flat", give: flat, searched: signal.Range{From: 0, Until: 29}, parameters: signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 6, Theta: 3, Sustain: 3}},
		{name: "rising series asked for a fall", give: insightstest.RampAfter(30, 14, 1), searched: signal.Range{From: 0, Until: 29}, parameters: signal.TrendParameters{Direction: domain.DirectionFalling, SmoothingSamples: 6, Theta: 3, Sustain: 3}},
		{name: "shorter than the window", give: insightstest.RampAfter(4, -1, 1), searched: signal.Range{From: 0, Until: 3}, parameters: signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 6, Theta: 3, Sustain: 3}},
		{name: "not sustained long enough", give: insightstest.RampAfter(30, 14, 1), searched: signal.Range{From: 0, Until: 29}, parameters: signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 6, Theta: 3, Sustain: 100}},
		{name: "all holes", give: holes(30), searched: signal.Range{From: 0, Until: 29}, parameters: signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 6, Theta: 3, Sustain: 3}},
		{name: "single sample", give: []float64{3}, searched: signal.Range{From: 0, Until: 0}, parameters: signal.TrendParameters{Direction: domain.DirectionRising}},
		{name: "outside the slice", give: flat, searched: signal.Range{From: 40, Until: 50}, parameters: signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 6, Theta: 3, Sustain: 3}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := signal.Trends(tt.give, tt.searched, tt.parameters); len(got) != 0 {
				t.Errorf("Trends = %+v, want nothing", got)
			}
		})
	}
}

func TestTrends_StillGaugeThatStepsOnce_IsATrendOnlyWhenTheStepIsMoreThanItCallsStill(t *testing.T) {
	parameters := signal.TrendParameters{Direction: domain.DirectionRising, SmoothingSamples: 6, Theta: 3, Sustain: 3}
	searched := signal.Range{From: 0, Until: 399}

	if got := signal.Trends(stepValues(400, 200, 100, 101), searched, parameters); len(got) != 0 {
		t.Errorf("Trends over one step of a hundredth = %+v, want nothing", got)
	}

	got := signal.Trends(stepValues(400, 200, 100, 200), searched, parameters)
	if len(got) != 1 || !got[0].Pronounced || math.IsInf(got[0].Magnitude, 0) {
		t.Errorf("Trends over a doubling = %+v, want one episode, pronounced by a finite magnitude", got)
	}
}
