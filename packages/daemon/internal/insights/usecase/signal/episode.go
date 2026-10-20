package signal

import (
	"cmp"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// spanning places an episode over the run it was found in: it begins, changes and ends with the run.
// A gap, which ends at the reading after its last hole, and a reset, whose onset is the reading
// before the drop, are placed by their own detectors.
func spanning(run Range, episode Episode) Episode {
	episode.Onset, episode.End = run.From, run.Until
	episode.From, episode.Until = run.From, run.Until
	episode.ChangePoint = run.From

	return episode
}

func sortByOnset(episodes []Episode) {
	slices.SortStableFunc(episodes, func(left, right Episode) int { return cmp.Compare(left.Onset, right.Onset) })
}

func directionOf(falling bool) domain.Direction {
	if falling {
		return domain.DirectionFalling
	}

	return domain.DirectionRising
}
