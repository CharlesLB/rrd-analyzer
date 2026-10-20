package signal

import (
	"math"
	"sync"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

type ThresholdParameters struct {
	Comparison     domain.Comparison
	Level          float64
	MinimumSamples int
}

// Thresholds returns every maximal run of present values strictly beyond the level that lasts at
// least MinimumSamples. A hole ends a run: a crossing the data cannot show is not asserted.
func Thresholds(values []float64, searched Range, parameters ThresholdParameters) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	below := parameters.Comparison == domain.ComparisonBelow
	beyond := func(value float64) bool {
		if below {
			return value < parameters.Level
		}

		return value > parameters.Level
	}

	scale := sync.OnceValue(func() float64 { return RobustScale(presentValues(values, clamped)) })
	direction := directionOf(below)

	var episodes []Episode

	for _, run := range runsWhere(clamped, func(index int) bool { return Present(values[index]) && beyond(values[index]) }) {
		if run.length() < max(1, parameters.MinimumSamples) {
			continue
		}

		extreme := extremeOf(values, run, direction)
		mean, _ := MeanOf(values, run)
		magnitude := zScore(math.Abs(extreme-parameters.Level), scale())

		episodes = append(episodes, spanning(run, Episode{
			Base: values[run.From], Peak: extreme, Mean: mean, Median: math.NaN(),
			Direction: direction, Magnitude: magnitude, Pronounced: magnitude >= pronouncedLevelBars,
		}))
	}

	return episodes
}
