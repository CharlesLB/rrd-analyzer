package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestDrift_LateEdgeAboveEarlyEdgeTimesRatio_FiresOverTheWholeRange(t *testing.T) {
	parameters := signal.DriftParameters{Ratio: 1.25, EdgeFraction: 0.1, MinimumEdgeSamples: 6}

	got, found := signal.Drift(stepValues(20, 10, 10, 20), signal.Range{From: 0, Until: 19}, parameters)
	if !found {
		t.Fatal("Drift found nothing")
	}

	if spanOf(got) != (span{onset: 0, end: 19, from: 0, until: 19}) || got.Base != 10 || got.Peak != 20 || got.Direction != domain.DirectionTrend {
		t.Errorf("Drift = %+v, want 0..19 from 10 to 20 as a trend", got)
	}

	if got.Mean != 15 || got.Median != 20 {
		t.Errorf("mean %v median %v, want 15 and the upper median 20", got.Mean, got.Median)
	}
}

func TestDrift_FlatHolesOrOutOfRange_FindsNothing(t *testing.T) {
	parameters := signal.DriftParameters{Ratio: 1.25, EdgeFraction: 0.1, MinimumEdgeSamples: 6}

	tests := []struct {
		name     string
		give     []float64
		searched signal.Range
		ratio    float64
	}{
		{name: "flat", give: stepValues(20, 10, 10, 10), searched: signal.Range{From: 0, Until: 19}, ratio: 1.25},
		{name: "rise below the ratio", give: stepValues(20, 10, 10, 20), searched: signal.Range{From: 0, Until: 19}, ratio: 3},
		{name: "all holes", give: holes(20), searched: signal.Range{From: 0, Until: 19}, ratio: 1.25},
		{name: "before the slice", give: stepValues(20, 10, 10, 20), searched: signal.Range{From: -30, Until: -10}, ratio: 1.25},
		{name: "idle at zero", give: stepValues(20, 10, 0, 0), searched: signal.Range{From: 0, Until: 19}, ratio: 1.25},
		{name: "falling further below zero", give: stepValues(20, 10, -10, -11), searched: signal.Range{From: 0, Until: 19}, ratio: 1.25},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parameters.Ratio = tt.ratio
			if got, found := signal.Drift(tt.give, tt.searched, parameters); found {
				t.Errorf("Drift = %+v, want nothing", got)
			}
		})
	}
}

func TestDrift_EdgesReachingPastAnEmptyRange_StillCompareButHaveNoMedian(t *testing.T) {
	values := holes(30)
	for index := 14; index <= 19; index++ {
		values[index] = 30
	}

	for index := 23; index <= 29; index++ {
		values[index] = 10
	}

	got, found := signal.Drift(values, signal.Range{From: 20, Until: 22}, signal.DriftParameters{Ratio: 1.25, EdgeFraction: 0.1, MinimumEdgeSamples: 6})
	if !found {
		t.Fatal("Drift found nothing")
	}

	if got.Base != 10 || got.Peak != 30 || !math.IsNaN(got.Median) || !math.IsNaN(got.Mean) {
		t.Errorf("Drift = %+v, want 10 to 30 with no median or mean inside the range", got)
	}
}

func TestDrift_RangeReachingBeforeTheFirstReading_StartsAtTheFirstReading(t *testing.T) {
	parameters := signal.DriftParameters{Ratio: 1.25, EdgeFraction: 0.1, MinimumEdgeSamples: 6}

	got, found := signal.Drift(stepValues(100, 50, 10, 20), signal.Range{From: -5, Until: 99}, parameters)
	if !found {
		t.Fatal("Drift found nothing")
	}

	if spanOf(got) != (span{onset: 0, end: 99, from: 0, until: 99}) || got.Base != 10 || got.Peak != 20 {
		t.Errorf("Drift = %+v, want 0..99 from 10 to 20: nothing was read before the first sample", got)
	}
}
