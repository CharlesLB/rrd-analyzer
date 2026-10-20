package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestChangePoints_LevelShift_OnsetIsTheFirstDepartingBucket(t *testing.T) {
	parameters := signal.ChangePointParameters{SmoothingSamples: 3, Theta: 3, Sustain: 3}

	tests := []struct {
		name          string
		give          []float64
		wantBase      float64
		wantPeak      float64
		wantDirection domain.Direction
	}{
		{name: "step up", give: stepValues(30, 15, 0, 10), wantBase: 0, wantPeak: 10, wantDirection: domain.DirectionRising},
		{name: "step down", give: stepValues(30, 15, 10, 0), wantBase: 10, wantPeak: 0, wantDirection: domain.DirectionFalling},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := signal.ChangePoints(tt.give, signal.Range{From: 0, Until: 29}, parameters)
			if len(got) != 1 {
				t.Fatalf("ChangePoints = %+v, want one episode", got)
			}

			if spanOf(got[0]) != (span{onset: 15, end: 17, from: 15, until: 17}) || got[0].ChangePoint != 15 ||
				got[0].Base != tt.wantBase || got[0].Peak != tt.wantPeak || got[0].Direction != tt.wantDirection {
				t.Errorf("ChangePoints = %+v, want 15..17 from %v to %v %s", got[0], tt.wantBase, tt.wantPeak, tt.wantDirection)
			}
		})
	}
}

func TestChangePoints_NothingToDetect_FindsNothing(t *testing.T) {
	parameters := signal.ChangePointParameters{SmoothingSamples: 3, Theta: 3, Sustain: 3}

	tests := []struct {
		name       string
		give       []float64
		searched   signal.Range
		parameters signal.ChangePointParameters
	}{
		{name: "constant", give: stepValues(30, 0, 4, 4), searched: signal.Range{From: 0, Until: 29}, parameters: parameters},
		{name: "shift too short to be sustained", give: stepValues(30, 15, 0, 10), searched: signal.Range{From: 0, Until: 29}, parameters: signal.ChangePointParameters{SmoothingSamples: 3, Theta: 3, Sustain: 4}},
		{name: "all holes", give: holes(10), searched: signal.Range{From: 0, Until: 9}, parameters: parameters},
		{name: "single sample", give: []float64{2}, searched: signal.Range{From: 0, Until: 0}, parameters: parameters},
		{name: "outside the slice", give: stepValues(30, 15, 0, 10), searched: signal.Range{From: 31, Until: 40}, parameters: parameters},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := signal.ChangePoints(tt.give, tt.searched, tt.parameters); len(got) != 0 {
				t.Errorf("ChangePoints = %+v, want nothing", got)
			}
		})
	}
}

func TestChangePoints_AfterACounterWrapLeavesTheWindow_FindsNothingInTheFlatRest(t *testing.T) {
	parameters := signal.ChangePointParameters{SmoothingSamples: 2, Theta: 3, Sustain: 1}
	values := append([]float64{1e17}, stepValues(30, 30, 3, 3)...)
	values = append(values, math.NaN(), math.NaN())
	values = append(values, stepValues(30, 30, 3, 3)...)

	for _, episode := range signal.ChangePoints(values, signal.Range{From: 0, Until: len(values) - 1}, parameters) {
		if episode.Onset > parameters.SmoothingSamples {
			t.Errorf("ChangePoints found %+v, want nothing after the wrap has left the smoothing window", episode)
		}
	}
}

func TestChangePoints_StillGaugeThatStepsOnce_IsAChangeOnlyWhenTheStepIsMoreThanItCallsStill(t *testing.T) {
	parameters := signal.ChangePointParameters{SmoothingSamples: 3, Theta: 3, Sustain: 3}
	searched := signal.Range{From: 0, Until: 399}

	if got := signal.ChangePoints(stepValues(400, 200, 100, 101), searched, parameters); len(got) != 0 {
		t.Errorf("ChangePoints over one step of a hundredth = %+v, want nothing", got)
	}

	got := signal.ChangePoints(stepValues(400, 200, 100, 200), searched, parameters)
	if len(got) != 1 || got[0].Onset != 200 || !got[0].Pronounced || math.IsInf(got[0].Magnitude, 0) {
		t.Errorf("ChangePoints over a doubling = %+v, want one at 200, pronounced by a finite magnitude", got)
	}
}
