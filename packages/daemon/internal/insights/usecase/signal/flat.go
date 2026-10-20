package signal

import (
	"math"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

type FlatParameters struct {
	Tolerance      float64
	MinimumSamples int
}

// Flats finds readings that do not move: maximal runs of present values whose spread stays within
// Tolerance of the run's first value, lasting at least MinimumSamples. The tolerance is relative,
// so a stuck 58% and a stuck 58 GB read the same, and a run of zeros allows no movement at all. A
// hole ends a run: a collector that stopped writing leaves a gap, and a flat line is one that
// keeps writing the same number. The level a run is stuck at, its base and its peak, is the median
// of the run, which stays the stuck number when a coarse bucket averages it with a neighbour.
func Flats(values []float64, searched Range, parameters FlatParameters) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	var episodes []Episode

	keep := func(run Range) {
		if run.From >= 0 && run.length() >= max(1, parameters.MinimumSamples) {
			episodes = append(episodes, flatEpisode(values, run, parameters.MinimumSamples))
		}
	}

	run := Range{From: -1}
	low, high := 0.0, 0.0

	for index := clamped.From; index <= clamped.Until; index++ {
		value := values[index]
		if !Present(value) {
			keep(Range{From: run.From, Until: index - 1})
			run.From = -1

			continue
		}

		if run.From >= 0 && math.Max(high, value)-math.Min(low, value) <= parameters.Tolerance*math.Abs(values[run.From]) {
			low, high = math.Min(low, value), math.Max(high, value)

			continue
		}

		keep(Range{From: run.From, Until: index - 1})
		run.From, low, high = index, value, value
	}

	keep(Range{From: run.From, Until: clamped.Until})

	return episodes
}

func flatEpisode(values []float64, run Range, minimumSamples int) Episode {
	mean, _ := MeanOf(values, run)
	level, _ := MedianOf(values, run)
	length := run.length()

	return spanning(run, Episode{
		Base: level, Peak: level, Mean: mean, Median: level,
		Direction: domain.DirectionFlat, Magnitude: float64(length), Pronounced: length >= pronouncedFlatRuns*max(1, minimumSamples),
	})
}
