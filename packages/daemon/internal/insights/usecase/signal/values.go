package signal

import (
	"math"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// extremeOf is the largest present value of a range for a rising episode and the smallest for a
// falling one, NaN when the range holds nothing.
func extremeOf(values []float64, searched Range, direction domain.Direction) float64 {
	extreme := math.NaN()
	for index := searched.From; index <= searched.Until; index++ {
		value := values[index]
		if !Present(value) {
			continue
		}

		switch {
		case !Present(extreme):
			extreme = value
		case direction == domain.DirectionFalling:
			extreme = math.Min(extreme, value)
		default:
			extreme = math.Max(extreme, value)
		}
	}

	return extreme
}

// trailingMeans returns, for each index of the range, the mean of the present values in the window
// that ends there. The window never reaches before the range, and a window of holes is a hole.
//
// The window slides by adding the reading that enters and taking away the one that leaves, which
// loses the small readings beside a huge one: a counter wrap reads 1e17 next to 3, and the plain sum
// would carry what it rounded away into every window after the wrap has left. The sum is
// compensated to keep that residue, and starts over whenever the window holds no reading.
func trailingMeans(values []float64, searched Range, window int) []float64 {
	means := make([]float64, searched.length())
	var sum compensatedSum
	count := 0

	for index := searched.From; index <= searched.Until; index++ {
		if Present(values[index]) {
			sum.add(values[index])
			count++
		}

		if leaving := index - window; leaving >= searched.From && Present(values[leaving]) {
			sum.add(-values[leaving])
			count--
		}

		means[index-searched.From] = math.NaN()
		if count == 0 {
			sum = compensatedSum{}

			continue
		}

		means[index-searched.From] = sum.total() / float64(count)
	}

	return means
}

// compensatedSum is Neumaier's summation: compensation holds what each addition rounded away.
type compensatedSum struct {
	sum          float64
	compensation float64
}

func (running *compensatedSum) add(value float64) {
	next := running.sum + value
	if math.Abs(running.sum) >= math.Abs(value) {
		running.compensation += (running.sum - next) + value
	} else {
		running.compensation += (value - next) + running.sum
	}

	running.sum = next
}

func (running compensatedSum) total() float64 {
	return running.sum + running.compensation
}

// levelOf is the level the readings of a range stand at, their median, and zero when the range
// holds none: differences taken from no readings are no differences, so nothing is scaled by it.
func levelOf(values []float64, searched Range) float64 {
	level, _ := MedianOf(values, searched)

	return level
}

func consecutiveDifferences(values []float64, searched Range) []float64 {
	differences := make([]float64, 0, searched.Until-searched.From)
	for index := searched.From + 1; index <= searched.Until; index++ {
		if Present(values[index]) && Present(values[index-1]) {
			differences = append(differences, values[index]-values[index-1])
		}
	}

	return differences
}

// laggedDifferences is how far each value moved from the one lag samples before it, and a hole
// where either end is one or there is nothing that far back.
func laggedDifferences(values []float64, lag int) []float64 {
	differences := make([]float64, len(values))

	for offset := range values {
		differences[offset] = math.NaN()
		if offset >= lag && Present(values[offset]) && Present(values[offset-lag]) {
			differences[offset] = values[offset] - values[offset-lag]
		}
	}

	return differences
}

// largestDeparture is the furthest a run of the series strays from center, the series laid out
// from the start of the range it was computed over.
func largestDeparture(series []float64, laidOut, run Range, center float64) float64 {
	largest := 0.0
	for index := run.From; index <= run.Until; index++ {
		largest = math.Max(largest, math.Abs(series[index-laidOut.From]-center))
	}

	return largest
}

func firstPresent(values []float64, searched Range) (float64, bool) {
	clamped, overlaps := searched.clamp(len(values))
	if !overlaps {
		return 0, false
	}

	for index := clamped.From; index <= clamped.Until; index++ {
		if Present(values[index]) {
			return values[index], true
		}
	}

	return 0, false
}

func lastPresent(values []float64, searched Range) (float64, bool) {
	clamped, overlaps := searched.clamp(len(values))
	if !overlaps {
		return 0, false
	}

	for index := clamped.Until; index >= clamped.From; index-- {
		if Present(values[index]) {
			return values[index], true
		}
	}

	return 0, false
}
