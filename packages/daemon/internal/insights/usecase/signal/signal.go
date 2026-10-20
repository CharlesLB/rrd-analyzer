// Package signal holds the numeric detectors the rules are built from. Every function is pure and
// reads a slice in which a NaN is a hole: holes are skipped, never interpolated, because a gap in
// a round robin archive is itself evidence.
//
// A product that is then added to or compared with something else is written float64(a*b). The
// conversion looks redundant but is not: an explicit conversion rounds the product, which the Go
// specification says stops the compiler fusing the multiply and the add into one instruction, as it
// may on arm64. Fused, a bar can differ from the reference prototype's in its last bit, and a value
// sitting exactly on that bar would be an episode on one machine and not on another.
package signal

import (
	"math"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// robustScaleFactor turns a median absolute deviation into the standard deviation it estimates for
// normally distributed noise, so a bar of three reads as "three sigmas" on any metric.
const robustScaleFactor = 1.4826

// Range is an inclusive index span. Detectors accept ranges that reach outside the slice and clamp
// them, the way the reference prototype does.
type Range struct {
	From  int
	Until int
}

// Within is the part of the range that lies inside a slice of the given length, and whether there
// is any.
func (searched Range) Within(length int) (Range, bool) {
	return searched.clamp(length)
}

func (searched Range) clamp(length int) (Range, bool) {
	clamped := Range{From: max(0, searched.From), Until: min(length-1, searched.Until)}

	return clamped, clamped.From <= clamped.Until
}

// length is how many samples the range holds, both ends included.
func (searched Range) length() int {
	return searched.Until - searched.From + 1
}

// Episode is one thing a detector saw. Onset and End bound the episode itself; From and Until are
// the span its evidence covers, which for a gap stops at the last hole while End is the first
// instant reporting could have resumed.
type Episode struct {
	Onset       int
	End         int
	From        int
	Until       int
	ChangePoint int

	Base   float64
	Peak   float64
	Mean   float64
	Median float64

	Direction domain.Direction

	// Magnitude ranks episodes of the same detector against each other. Pronounced says whether
	// it clears the detector's own bar for a clear signal, which feeds confidence.
	Magnitude  float64
	Pronounced bool

	// Count is how many detections a burst merged into this episode, and zero for a single one.
	Count int

	// SamplesToLevel is how many samples after Until the episode's pace reaches the level its
	// condition forecasts to. HasForecast says one was asked for and found.
	SamplesToLevel float64
	HasForecast    bool
}

func Present(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

// RoundHalfUp is JavaScript's Math.round: halves go towards positive infinity, not to even and not
// away from zero. The index math and duration text both have to agree with the reference.
func RoundHalfUp(value float64) float64 {
	floor := math.Floor(value)
	if value-floor >= 0.5 {
		return floor + 1
	}

	return floor
}

func presentValues(values []float64, searched Range) []float64 {
	present := make([]float64, 0, searched.length())
	for index := searched.From; index <= searched.Until; index++ {
		if Present(values[index]) {
			present = append(present, values[index])
		}
	}

	return present
}

// upperMedian is the reference prototype's median: the element at floor(n/2) of the sorted
// values, which for an even count is the upper of the two middle values.
func upperMedian(sorted []float64) float64 {
	return sorted[len(sorted)/2]
}

// RobustScale estimates the noise of a sample set from its median absolute deviation. It returns
// zero for fewer than two values or a set that never varies.
func RobustScale(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}

	_, scale := medianAndScale(values)

	return scale
}

// medianAndScale is the upper median of a non-empty sample set and its robust scale, from one
// sorted copy that is then reused for the deviations, rather than a sorted copy for each.
func medianAndScale(values []float64) (median, scale float64) {
	sorted := sortedCopy(values)
	median = upperMedian(sorted)

	return median, scaleAround(sorted, median, median)
}

// medianAndScaleOfChanges is medianAndScale for a set of differences between readings, such as the
// slopes of a series. Their own median says nothing of how large the readings are, so the level
// the readings stand at is handed over for the scale to be floored against.
func medianAndScaleOfChanges(changes []float64, level float64) (median, scale float64) {
	sorted := sortedCopy(changes)
	median = upperMedian(sorted)

	return median, scaleAround(sorted, median, level)
}

// scaleOfChanges is the robust scale of a set of differences between readings standing at level,
// and zero for fewer than two of them.
func scaleOfChanges(changes []float64, level float64) float64 {
	if len(changes) < 2 {
		return 0
	}

	_, scale := medianAndScaleOfChanges(changes, level)

	return scale
}

func sortedCopy(values []float64) []float64 {
	sorted := slices.Clone(values)
	slices.Sort(sorted)

	return sorted
}

// scaleAround is the robust scale of values already sorted around their median, which stand at
// level. It overwrites them with their deviations, so the caller hands over a copy it no longer
// needs.
func scaleAround(sorted []float64, median, level float64) float64 {
	if len(sorted) < 2 {
		return 0
	}

	for index, value := range sorted {
		sorted[index] = math.Abs(value - median)
	}

	slices.Sort(sorted)

	if deviation := upperMedian(sorted); deviation > 0 {
		return float64(deviation * robustScaleFactor)
	}

	return steadyScale(sorted, level)
}

// steadyScale is the scale of a set more than half of which sits exactly on its median, given its
// deviations in ascending order. The median absolute deviation of such a set is zero, and a scale
// of zero makes every movement infinitely many deviations: a gauge that reads 100 for a month and
// 101 once was an infinitely pronounced rise, and each 1 of a series of zeros and ones an
// infinitely tall spike.
//
// The scale is instead the root mean square of the deviations, which a rare departure barely moves
// and a frequent one makes large. It is never less than the fraction of its level the flat detector
// already calls not moving, so one step of a hundredth is one deviation rather than a signal. And
// it is never more than the smallest departure the set shows: a few large ones, the resets of a
// counter that otherwise climbs evenly, would otherwise pass for noise and hide the climb.
//
// A set that never departs at all has no scale, and zScore says what that means.
func steadyScale(deviations []float64, level float64) float64 {
	firstMoving := slices.IndexFunc(deviations, func(deviation float64) bool { return deviation > 0 })
	if firstMoving < 0 {
		return 0
	}

	sumOfSquares := 0.0
	for _, deviation := range deviations[firstMoving:] {
		sumOfSquares += float64(deviation * deviation)
	}

	spread := math.Sqrt(sumOfSquares / float64(len(deviations)))
	unmoving := float64(DefaultFlatTolerance * math.Abs(level))

	return math.Min(deviations[firstMoving], math.Max(spread, unmoving))
}

// MeanOf averages the present values of a range, clamped to the slice.
func MeanOf(values []float64, searched Range) (float64, bool) {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return 0, false
	}

	sum := 0.0
	count := 0

	for index := clamped.From; index <= clamped.Until; index++ {
		if Present(values[index]) {
			sum += values[index]
			count++
		}
	}

	if count == 0 {
		return 0, false
	}

	return sum / float64(count), true
}

// MedianOf is the median of the present values of a range, clamped to the slice.
func MedianOf(values []float64, searched Range) (float64, bool) {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return 0, false
	}

	present := presentValues(values, clamped)
	if len(present) == 0 {
		return 0, false
	}

	return upperMedian(sortedCopy(present)), true
}

// zScore is a deviation in units of scale. A scale of zero means the set it was taken from never
// varied at all, so there is no noise to measure against: any departure from it is beyond every
// bar, and none is no departure.
func zScore(deviation, scale float64) float64 {
	if scale > 0 {
		return deviation / scale
	}

	if deviation > 0 {
		return math.Inf(1)
	}

	return 0
}
