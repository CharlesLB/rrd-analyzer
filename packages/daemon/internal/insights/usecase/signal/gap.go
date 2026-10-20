package signal

import (
	"math"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// Gaps is the reference prototype's findGap, generalised to every run instead of the first: each
// run of at least minimumRun consecutive holes inside the range is an episode. A run still open
// at the end of the range ends there.
func Gaps(values []float64, searched Range, minimumRun int) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	minimumRun = max(1, minimumRun)

	var episodes []Episode

	missing := func(index int) bool { return !Present(values[index]) }
	for _, run := range runsWhere(clamped, missing) {
		if run.length() < minimumRun {
			continue
		}

		episodes = append(episodes, gapEpisode(run.From, run.Until, minimumRun))
	}

	return episodes
}

func gapEpisode(firstHole, lastHole, minimumRun int) Episode {
	run := lastHole - firstHole + 1

	return Episode{
		Onset:       firstHole,
		End:         lastHole + 1,
		From:        firstHole,
		Until:       lastHole,
		ChangePoint: firstHole,
		Base:        math.NaN(),
		Peak:        math.NaN(),
		Mean:        math.NaN(),
		Median:      math.NaN(),
		Direction:   domain.DirectionGap,
		Magnitude:   float64(run),
		Pronounced:  run >= pronouncedGapRuns*minimumRun,
	}
}
