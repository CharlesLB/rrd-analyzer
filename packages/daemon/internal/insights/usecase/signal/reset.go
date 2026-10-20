package signal

import (
	"math"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// Resets finds the instants a monotone series falls back: an uptime or counter reading below the
// previous present reading by more than dropFraction of it. Holes between the two readings are
// allowed, since a restart usually leaves one. A drop from the reading the previous drop landed on
// continues that reset instead of starting another: a restart inside a consolidated bucket averages
// the old uptime with the new one, and the series only reaches the new one a bucket later.
func Resets(values []float64, searched Range, dropFraction float64) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	var episodes []Episode

	previous := -1
	for index := clamped.From; index <= clamped.Until; index++ {
		if !Present(values[index]) {
			continue
		}

		if previous >= 0 && values[previous] > 0 && values[index] < float64(values[previous]*(1-dropFraction)) {
			if last := len(episodes) - 1; last >= 0 && episodes[last].End == previous {
				continued := &episodes[last]
				continued.End, continued.Until, continued.Peak = index, index, values[index]
				continued.Magnitude = (continued.Base - values[index]) / continued.Base
				previous = index

				continue
			}

			drop := (values[previous] - values[index]) / values[previous]
			episodes = append(episodes, Episode{
				Onset: previous, End: index, From: previous, Until: index, ChangePoint: index,
				Base: values[previous], Peak: values[index], Mean: math.NaN(), Median: math.NaN(),
				Direction: domain.DirectionReset, Magnitude: drop, Pronounced: true,
			})
		}

		previous = index
	}

	return episodes
}
