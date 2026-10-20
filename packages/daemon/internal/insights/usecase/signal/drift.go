package signal

import (
	"math"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

type DriftParameters struct {
	Ratio              float64
	EdgeFraction       float64
	MinimumEdgeSamples int
}

// Drift is the reference prototype's latency trend. It compares the mean of the first edge of the
// range with the mean of the last edge, each edge being a tenth of the range but never fewer than
// six samples, and fires when the late mean reaches the early mean times the ratio. A ratio only
// measures growth from a positive start: from zero or below, the prototype's test held for an idle
// series and for one falling further below zero, and called both a drift up.
//
// The range is first cut to the readings there are. A lookback reaching before the first of them
// would otherwise size its edges by samples that do not exist and place the episode's onset before
// the series begins.
func Drift(values []float64, searched Range, parameters DriftParameters) (Episode, bool) {
	searched, overlaps := searched.clamp(len(values))
	if !overlaps {
		return Episode{}, false
	}

	edge := max(parameters.MinimumEdgeSamples, int(math.Floor(float64(searched.Until-searched.From)*parameters.EdgeFraction)))

	early, hasEarly := MeanOf(values, Range{From: searched.From, Until: searched.From + edge})
	late, hasLate := MeanOf(values, Range{From: searched.Until - edge, Until: searched.Until})

	if !hasEarly || !hasLate || !(early > 0) || late < float64(early*parameters.Ratio) {
		return Episode{}, false
	}

	median := math.NaN()
	mean := math.NaN()

	if windowMean, hasMean := MeanOf(values, searched); hasMean {
		mean = windowMean
	}

	scale := 0.0
	if present := presentValues(values, searched); len(present) > 0 {
		median, scale = medianAndScale(present)
	}

	magnitude := zScore(late-early, scale)

	return spanning(searched, Episode{
		Base:       early,
		Peak:       late,
		Mean:       mean,
		Median:     median,
		Direction:  domain.DirectionTrend,
		Magnitude:  magnitude,
		Pronounced: magnitude >= pronouncedDriftBars,
	}), true
}
