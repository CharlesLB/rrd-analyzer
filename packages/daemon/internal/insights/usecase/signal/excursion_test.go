package signal_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

var excursionValues = []float64{1, 1, 1, 1, 1, 5, 9, 10, 6, 1, 1, 1}

func TestExcursions_KnownPeak_ExpandsWhileNeighboursClearTheBar(t *testing.T) {
	tests := []struct {
		name       string
		give       []float64
		searched   signal.Range
		parameters signal.ExcursionParameters
		want       span
		wantBase   float64
		wantPeak   float64
		wantMedian float64
		wantMean   float64
	}{
		{name: "whole range", give: excursionValues, searched: signal.Range{From: 0, Until: 11},
			parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8},
			want:       span{onset: 5, end: 8, from: 5, until: 8}, wantBase: 5, wantPeak: 10, wantMedian: 1, wantMean: 7.5},
		{name: "the range edge stops the expansion", give: excursionValues, searched: signal.Range{From: 6, Until: 11},
			parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 1},
			want:       span{onset: 6, end: 7, from: 6, until: 7}, wantBase: 9, wantPeak: 10, wantMedian: 6, wantMean: 9.5},
		{name: "a hole stops the expansion", give: []float64{1, 1, 1, 1, 1, 1, 5, hole, 9, 10, 6, 1}, searched: signal.Range{From: 0, Until: 11},
			parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8},
			want:       span{onset: 8, end: 10, from: 8, until: 10}, wantBase: 9, wantPeak: 10, wantMedian: 1, wantMean: 25.0 / 3},
		{name: "ties keep the first peak", give: []float64{1, 1, 1, 1, 1, 1, 1, 1, 3, 3}, searched: signal.Range{From: 0, Until: 9},
			parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8},
			want:       span{onset: 8, end: 9, from: 8, until: 9}, wantBase: 3, wantPeak: 3, wantMedian: 1, wantMean: 3},
		{name: "guards that hold", give: excursionValues, searched: signal.Range{From: 0, Until: 11},
			parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8, PeakAtLeast: pointer(10), PeakOverMedian: pointer(10)},
			want:       span{onset: 5, end: 8, from: 5, until: 8}, wantBase: 5, wantPeak: 10, wantMedian: 1, wantMean: 7.5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			episodes := signal.Excursions(tt.give, tt.searched, tt.parameters)
			if len(episodes) != 1 {
				t.Fatalf("Excursions = %+v, want the one episode around the peak", episodes)
			}

			got := episodes[0]
			if spanOf(got) != tt.want || got.Base != tt.wantBase || got.Peak != tt.wantPeak || got.Median != tt.wantMedian || !sameValue(got.Mean, tt.wantMean) {
				t.Errorf("Excursions = %+v, want span %+v base %v peak %v median %v mean %v", got, tt.want, tt.wantBase, tt.wantPeak, tt.wantMedian, tt.wantMean)
			}

			if got.Direction != domain.DirectionRising || got.ChangePoint != tt.want.onset {
				t.Errorf("direction %s change point %d, want rising at %d", got.Direction, got.ChangePoint, tt.want.onset)
			}
		})
	}
}

func TestExcursions_TwoSurgesAndABump_KeepEverySurgeUpToTheLimitAndLeaveTheBump(t *testing.T) {
	values := make([]float64, 30)
	for index := range values {
		values[index] = float64(1 + index%2)
	}

	values[5], values[6], values[7] = 20, 30, 20
	values[20], values[21] = 15, 16
	values[26] = 3

	upToThree := signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8, MaximumEpisodes: 3}
	searched := signal.Range{From: 0, Until: 29}

	both := signal.Excursions(values, searched, upToThree)
	if len(both) != 2 || spanOf(both[0]) != (span{onset: 5, end: 7, from: 5, until: 7}) || spanOf(both[1]) != (span{onset: 20, end: 21, from: 20, until: 21}) || both[1].Peak != 16 {
		t.Errorf("Excursions = %+v, want the surges at 5..7 and 20..21 in onset order and not the bump at 26", both)
	}

	onlyOne := upToThree
	onlyOne.MaximumEpisodes = 1

	if one := signal.Excursions(values, searched, onlyOne); len(one) != 1 || one[0] != both[0] {
		t.Errorf("Excursions with a limit of one = %+v, want only the larger surge %+v", one, both[0])
	}
}

// surgeOver lays a bell of the given height over a baseline that alternates between ten and eleven,
// so the slopes of the surge pass through every level between its peak and the noise.
func surgeOver(values []float64, center int, height float64) {
	const spread = 20.0

	for index := range values {
		distance := float64(index-center) / spread
		values[index] += height * math.Exp(-distance*distance/2)
	}
}

func alternatingBaseline(count int) []float64 {
	values := make([]float64, count)
	for index := range values {
		values[index] = float64(10 + index%2)
	}

	return values
}

func TestExcursions_OneSmoothSurge_IsOneEpisodeHoweverManyAreAllowed(t *testing.T) {
	values := alternatingBaseline(600)
	surgeOver(values, 300, 100)

	upToEight := signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8, MaximumEpisodes: 8}
	searched := signal.Range{From: 0, Until: 599}

	largest := signal.Excursions(values, searched, signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8})

	if got := signal.Excursions(values, searched, upToEight); len(got) != 1 || len(largest) != 1 || got[0] != largest[0] {
		t.Errorf("Excursions = %d episodes %+v, want only the largest %+v: the slopes of a surge are not surges of their own", len(got), got, largest)
	}
}

func TestExcursions_TwoSmoothSurges_AreTwoEpisodes(t *testing.T) {
	values := alternatingBaseline(900)
	surgeOver(values, 250, 100)
	surgeOver(values, 650, 60)

	got := signal.Excursions(values, signal.Range{From: 0, Until: 899}, signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8, MaximumEpisodes: 8})
	if len(got) != 2 || got[0].From > 250 || got[0].Until < 250 || got[1].From > 650 || got[1].Until < 650 {
		t.Errorf("Excursions = %+v, want one episode around 250 and one around 650", got)
	}
}

func TestExcursions_InsufficientOrGuardedData_FindNothing(t *testing.T) {
	tests := []struct {
		name       string
		give       []float64
		searched   signal.Range
		parameters signal.ExcursionParameters
	}{
		{name: "all holes", give: holes(12), searched: signal.Range{From: 0, Until: 11}, parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8}},
		{name: "fewer present samples than required", give: excursionValues, searched: signal.Range{From: 0, Until: 11}, parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 13}},
		{name: "single sample", give: []float64{4}, searched: signal.Range{From: 0, Until: 0}, parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8}},
		{name: "peak below the absolute guard", give: excursionValues, searched: signal.Range{From: 0, Until: 11}, parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8, PeakAtLeast: pointer(11)}},
		{name: "peak below the median guard", give: excursionValues, searched: signal.Range{From: 0, Until: 11}, parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 8, PeakOverMedian: pointer(11)}},
		{name: "range outside the slice", give: excursionValues, searched: signal.Range{From: 20, Until: 30}, parameters: signal.ExcursionParameters{ThresholdFraction: 0.25, MinimumSamples: 1}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := signal.Excursions(tt.give, tt.searched, tt.parameters); len(got) != 0 {
				t.Errorf("Excursions = %+v, want nothing", got)
			}
		})
	}
}
