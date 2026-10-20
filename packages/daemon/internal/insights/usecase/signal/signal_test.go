package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

var hole = math.NaN()

func pointer(value float64) *float64 {
	return &value
}

func holes(count int) []float64 {
	values := make([]float64, count)
	for index := range values {
		values[index] = hole
	}

	return values
}

func sameValue(got, want float64) bool {
	if math.IsNaN(want) {
		return math.IsNaN(got)
	}

	return math.Abs(got-want) <= 1e-12*math.Max(1, math.Abs(want))
}

type span struct {
	onset, end, from, until int
}

func spanOf(episode signal.Episode) span {
	return span{onset: episode.Onset, end: episode.End, from: episode.From, until: episode.Until}
}

func stepValues(count, split int, before, after float64) []float64 {
	values := make([]float64, count)
	for index := range values {
		values[index] = before
		if index >= split {
			values[index] = after
		}
	}

	return values
}

func TestRoundHalfUp_Halves_GoTowardsPositiveInfinity(t *testing.T) {
	tests := []struct {
		give float64
		want float64
	}{
		{give: 0.5, want: 1}, {give: 2.5, want: 3}, {give: -0.5, want: 0}, {give: -2.5, want: -2}, {give: 1.49, want: 1}, {give: -1.51, want: -2},
	}

	for _, tt := range tests {
		if got := signal.RoundHalfUp(tt.give); got != tt.want {
			t.Errorf("RoundHalfUp(%v) = %v, want %v", tt.give, got, tt.want)
		}
	}
}

func TestRobustScaleAndMeanOf_EdgeCases(t *testing.T) {
	if got := signal.RobustScale([]float64{3}); got != 0 {
		t.Errorf("RobustScale of one value = %v, want 0", got)
	}

	if got := signal.RobustScale([]float64{1, 2, 3, 4, 100}); !sameValue(got, 1.4826) {
		t.Errorf("RobustScale = %v, want one median absolute deviation scaled to 1.4826", got)
	}

	if _, found := signal.MeanOf([]float64{1, 2}, signal.Range{From: 5, Until: 9}); found {
		t.Error("MeanOf outside the slice found a mean")
	}

	if _, found := signal.MeanOf(holes(3), signal.Range{From: 0, Until: 2}); found {
		t.Error("MeanOf over holes found a mean")
	}
}

func TestRobustScale_SetMostlyOnItsMedian_IsScaledByHowOftenAndHowFarItDeparts(t *testing.T) {
	still := func(count int, departures ...float64) []float64 {
		return append(stepValues(count, 0, 100, 100), departures...)
	}

	tests := []struct {
		name string
		give []float64
		want float64
	}{
		{name: "never departs", give: still(10), want: 0},
		{name: "one small step is one deviation", give: still(99, 100.5), want: 0.5},
		{name: "one departure counts for how rare it is", give: still(99, 150), want: 5},
		{name: "never less than a hundredth of the level", give: still(9999, 150), want: 1},
		{name: "frequent departures are their root mean square", give: still(6, 104, 104, 104), want: 4 * math.Sqrt(3.0/9)},
		{name: "never more than the smallest departure", give: still(8, 101, 10000), want: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := signal.RobustScale(tt.give); !sameValue(got, tt.want) {
				t.Errorf("RobustScale = %v, want %v", got, tt.want)
			}
		})
	}
}
