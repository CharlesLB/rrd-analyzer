package signal

import (
	"math"
)

// SamplesToLevel projects an episode forwards: the pace is the least-squares slope of its present
// values, and the distance is from its last present value to the level. It finds nothing when the
// pace is flat or heads away from the level, or when the series is already there.
func SamplesToLevel(values []float64, episode Episode, level float64) (float64, bool) {
	clamped, ok := Range{From: episode.From, Until: episode.Until}.clamp(len(values))
	if !ok {
		return 0, false
	}

	last, hasLast := lastPresent(values, clamped)
	slope, hasSlope := slopeOf(values, clamped)

	if !hasLast || !hasSlope || slope == 0 {
		return 0, false
	}

	samples := (level - last) / slope
	if !(samples > 0) || math.IsInf(samples, 0) {
		return 0, false
	}

	return samples, true
}

func slopeOf(values []float64, searched Range) (float64, bool) {
	count, sumIndex, sumValue, sumIndexSquared, sumProduct := 0.0, 0.0, 0.0, 0.0, 0.0

	for index := searched.From; index <= searched.Until; index++ {
		if !Present(values[index]) {
			continue
		}

		position := float64(index - searched.From)
		count++
		sumIndex += position
		sumValue += values[index]
		sumIndexSquared += float64(position * position)
		sumProduct += float64(position * values[index])
	}

	spread := float64(count*sumIndexSquared) - float64(sumIndex*sumIndex)
	if count < 2 || spread == 0 {
		return 0, false
	}

	return (float64(count*sumProduct) - float64(sumIndex*sumValue)) / spread, true
}
