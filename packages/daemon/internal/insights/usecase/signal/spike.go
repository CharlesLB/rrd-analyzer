package signal

import (
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

type SpikeParameters struct {
	Level          *float64
	Theta          float64
	MaximumSamples int
}

// Spikes finds short excursions above a level that come back down inside the range: a run longer
// than MaximumSamples is a plateau, not a spike, and a run still above the level at the end of the
// range has not been seen to return. Without an explicit level the bar is theta robust deviations
// above the median, which is why spike conditions read the MAX archive.
func Spikes(values []float64, searched Range, parameters SpikeParameters) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	present := presentValues(values, clamped)
	if len(present) == 0 {
		return nil
	}

	median, scale := medianAndScale(present)
	level := median + float64(parameters.Theta*scale)
	if parameters.Level != nil {
		level = *parameters.Level
	}

	var episodes []Episode

	above := func(index int) bool { return Present(values[index]) && values[index] > level }
	for _, run := range runsWhere(clamped, above) {
		returned := run.Until < clamped.Until && Present(values[run.Until+1])
		if !returned || run.length() > max(1, parameters.MaximumSamples) {
			continue
		}

		base, hasBase := lastPresent(values, Range{From: clamped.From, Until: run.From - 1})
		if !hasBase || run.From == clamped.From {
			base = median
		}

		peak := extremeOf(values, run, domain.DirectionRising)
		mean, _ := MeanOf(values, run)
		magnitude := zScore(peak-median, scale)

		episodes = append(episodes, spanning(run, Episode{
			Base: base, Peak: peak, Mean: mean, Median: median,
			Direction: domain.DirectionRising, Magnitude: magnitude, Pronounced: magnitude >= pronouncedExcursionBars,
		}))
	}

	return episodes
}
