package signal

import (
	"math"
)

// consecutiveLag compares each smoothed value with the one right before it.
const consecutiveLag = 1

type ChangePointParameters struct {
	SmoothingSamples int
	Theta            float64
	Sustain          int
}

// ChangePoints finds onsets: the earliest bucket where the first difference of the smoothed series
// departs from its median by more than theta robust deviations, in the same direction, for
// sustain consecutive buckets. The onset is where the departure starts, not where it peaks.
func ChangePoints(values []float64, searched Range, parameters ChangePointParameters) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	smoothed := trailingMeans(values, clamped, max(1, parameters.SmoothingSamples))
	differences := laggedDifferences(smoothed, consecutiveLag)
	present := presentValues(differences, Range{From: 0, Until: len(differences) - 1})

	if len(present) == 0 {
		return nil
	}

	center, scale := medianAndScaleOfChanges(present, levelOf(values, clamped))
	bar := parameters.Theta * scale

	var episodes []Episode

	for _, sign := range []float64{1, -1} {
		departing := func(index int) bool {
			difference := differences[index-clamped.From]

			return Present(difference) && (difference-center)*sign > bar && difference != center
		}

		for _, run := range runsWhere(clamped, departing) {
			if run.length() < max(1, parameters.Sustain) {
				continue
			}

			episodes = append(episodes, changePointEpisode(values, differences, clamped, run, center, scale, sign, parameters.Theta))
		}
	}

	sortByOnset(episodes)

	return episodes
}

func changePointEpisode(values, differences []float64, clamped, run Range, center, scale, sign, theta float64) Episode {
	largest := largestDeparture(differences, clamped, run, center)

	// The difference that opened the run was taken against the smoothed reading just before it,
	// whose window holds a present reading inside before: the base is always found.
	before := Range{From: clamped.From, Until: max(clamped.From, run.From-1)}
	base, _ := lastPresent(values, before)

	peak, hasPeak := lastPresent(values, run)
	if !hasPeak {
		peak = math.NaN()
	}

	mean, _ := MeanOf(values, run)
	magnitude := zScore(largest, scale)

	return spanning(run, Episode{
		Base: base, Peak: peak, Mean: mean, Median: math.NaN(),
		Direction: directionOf(sign < 0), Magnitude: magnitude, Pronounced: magnitude >= pronouncedSlopeBars*theta,
	})
}
