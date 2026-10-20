package signal

import (
	"math"
	"slices"
)

// Bursts keeps only episodes that come close together: at least minimumCount of them starting no
// more than withinSamples after the first. A burst then takes in every further episode starting
// within that distance of the one before it, so a restart loop that goes on for an hour is one
// burst rather than several, and it becomes a single episode whose Count says how many it holds.
func Bursts(episodes []Episode, minimumCount, withinSamples int) []Episode {
	ordered := slices.Clone(episodes)
	sortByOnset(ordered)

	var bursts []Episode

	for first := 0; first < len(ordered); {
		last := first
		for last+1 < len(ordered) && ordered[last+1].Onset-ordered[first].Onset <= withinSamples {
			last++
		}

		if last-first+1 < max(1, minimumCount) {
			first++

			continue
		}

		for last+1 < len(ordered) && ordered[last+1].Onset-ordered[last].Onset <= withinSamples {
			last++
		}

		bursts = append(bursts, burstOf(ordered[first:last+1]))
		first = last + 1
	}

	return bursts
}

func burstOf(members []Episode) Episode {
	burst := members[0]
	burst.Peak = members[len(members)-1].Peak
	burst.Mean, burst.Median = math.NaN(), math.NaN()
	burst.Magnitude, burst.Pronounced, burst.Count = float64(len(members)), true, len(members)

	for _, member := range members[1:] {
		burst.End = max(burst.End, member.End)
		burst.Until = max(burst.Until, member.Until)
	}

	return burst
}
