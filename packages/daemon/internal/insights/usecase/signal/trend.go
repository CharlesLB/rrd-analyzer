package signal

import (
	"math"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

type TrendParameters struct {
	Direction        domain.Direction
	SmoothingSamples int
	Theta            float64
	Sustain          int
}

// Trends finds sustained slopes. The series is smoothed by a trailing mean over the window, the
// slope is the change of that mean across one window, and it fires where the slope stays beyond
// theta times its own noise for sustain consecutive buckets. The noise of the slope is derived
// from the median absolute deviation of consecutive differences, scaled to what a window of
// averaging leaves of it, which is what makes one theta portable across units.
func Trends(values []float64, searched Range, parameters TrendParameters) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	window := max(1, parameters.SmoothingSamples)
	smoothed := trailingMeans(values, clamped, window)
	slopes := laggedDifferences(smoothed, window)

	noise := float64(scaleOfChanges(consecutiveDifferences(values, clamped), levelOf(values, clamped)) * math.Sqrt(2/float64(window)))
	bar := parameters.Theta * noise
	falling := parameters.Direction == domain.DirectionFalling
	direction := directionOf(falling)

	var episodes []Episode

	crossing := func(index int) bool {
		slope := slopes[index-clamped.From]
		if !Present(slope) {
			return false
		}

		if falling {
			return slope < -bar && slope < 0
		}

		return slope > bar && slope > 0
	}

	sustained := sustainedRuns(runsWhere(clamped, crossing), max(1, parameters.Sustain))

	for _, run := range bridgeRuns(sustained, func(index int) bool { return keepsHeading(slopes[index-clamped.From], falling) }) {
		onset := climbStart(smoothed, clamped, run.From, window, falling)
		extent := Range{From: onset, Until: run.Until}
		base, hasBase := firstPresent(values, extent)
		if !hasBase {
			continue
		}

		steepest := largestDeparture(slopes, clamped, run, 0)

		mean, _ := MeanOf(values, extent)
		magnitude := zScore(steepest, noise)

		episodes = append(episodes, spanning(extent, Episode{
			Base: base, Peak: extremeOf(values, extent, direction), Mean: mean, Median: math.NaN(),
			Direction: direction, Magnitude: magnitude, Pronounced: magnitude >= pronouncedSlopeBars*parameters.Theta,
		}))
	}

	return episodes
}

// keepsHeading says whether a slope still points the way the trend does, however gently.
func keepsHeading(slope float64, falling bool) bool {
	if !Present(slope) {
		return false
	}

	if falling {
		return slope < 0
	}

	return slope > 0
}

func sustainedRuns(runs []Range, sustain int) []Range {
	var sustained []Range

	for _, run := range runs {
		if run.length() >= sustain {
			sustained = append(sustained, run)
		}
	}

	return sustained
}

// bridgeRuns joins each run to the next when every sample between them holds. A steady climb in
// noisy data dips under the bar for a bucket or two again and again without ever turning back, and
// each dip would otherwise end one episode and start another: one climb, a dozen findings. What
// separates two climbs is the series turning back or going silent between them, not it climbing
// more slowly for a moment.
func bridgeRuns(runs []Range, holds func(index int) bool) []Range {
	var bridged []Range

	for _, run := range runs {
		last := len(bridged) - 1
		if last >= 0 && everyIndex(Range{From: bridged[last].Until + 1, Until: run.From - 1}, holds) {
			bridged[last].Until = run.Until

			continue
		}

		bridged = append(bridged, run)
	}

	return bridged
}

func everyIndex(searched Range, holds func(index int) bool) bool {
	for index := searched.From; index <= searched.Until; index++ {
		if !holds(index) {
			return false
		}
	}

	return true
}

// climbStart walks back from the first bucket whose slope crossed the bar while the smoothed series
// kept moving the same way, at most one window: the crossing lags the change by up to a window,
// and the onset is where the climb began, not where it became significant.
func climbStart(smoothed []float64, clamped Range, crossing, window int, falling bool) int {
	onset := crossing
	limit := max(clamped.From, crossing-window)

	for onset > limit {
		previous, current := smoothed[onset-1-clamped.From], smoothed[onset-clamped.From]
		if !Present(previous) || (falling && previous <= current) || (!falling && previous >= current) {
			break
		}

		onset--
	}

	return onset
}
