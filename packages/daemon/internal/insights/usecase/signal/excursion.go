package signal

import (
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

type ExcursionParameters struct {
	ThresholdFraction float64
	MinimumSamples    int
	PeakAtLeast       *float64
	PeakOverMedian    *float64

	// MaximumEpisodes bounds how many episodes Excursions reports; below one it reports the first alone.
	MaximumEpisodes int
}

// Excursions is the reference prototype's findRise, repeated. Its first episode is the global peak
// of the range (the first index holding the strict maximum), widened left and right while the
// neighbours are present and above a bar a fraction of the way from the median to that peak; the
// optional guards reject a peak that is too low in absolute terms or relative to the median. After
// it, the highest peak outside every surge found so far becomes the next, for as long as that peak
// clears the same guards and stands out from the median of the whole range, so a month holding two
// surges reports both instead of only the larger.
func Excursions(values []float64, searched Range, parameters ExcursionParameters) []Episode {
	clamped, ok := searched.clamp(len(values))
	if !ok {
		return nil
	}

	present := presentValues(values, clamped)
	if len(present) < max(1, parameters.MinimumSamples) {
		return nil
	}

	sorted := sortedCopy(present)
	median := upperMedian(sorted)
	surges := surgeSearch{
		values: values, clamped: clamped, parameters: parameters,
		median: median, scale: scaleAround(sorted, median, median), claimed: make([]bool, clamped.length()),
	}

	var episodes []Episode

	for len(episodes) < max(1, parameters.MaximumEpisodes) {
		peakIndex, hasPeak := surges.highestUnclaimed()
		if !hasPeak || !clearsGuards(values[peakIndex], median, parameters) {
			break
		}

		// The first peak is reported whatever it says, as the prototype does; a later one has to
		// stand out, or every range would yield as many episodes as it is allowed.
		if len(episodes) > 0 && !surges.standsOut(values[peakIndex]) {
			break
		}

		episodes = append(episodes, surges.episodeAround(peakIndex))
	}

	sortByOnset(episodes)

	return episodes
}

// surgeSearch is one range being searched for excursions: the statistics every peak in it is
// measured against, taken once, and the samples the surges found so far have used up.
type surgeSearch struct {
	values     []float64
	clamped    Range
	parameters ExcursionParameters
	median     float64
	scale      float64

	// claimed is laid out from the start of the clamped range.
	claimed []bool
}

func (surges *surgeSearch) isClaimed(index int) bool {
	return surges.claimed[index-surges.clamped.From]
}

func (surges *surgeSearch) standsOut(value float64) bool {
	return zScore(value-surges.median, surges.scale) >= pronouncedExcursionBars
}

// highestUnclaimed is the first index holding the strict maximum of what no surge has claimed.
func (surges *surgeSearch) highestUnclaimed() (int, bool) {
	peakIndex := -1

	for index := surges.clamped.From; index <= surges.clamped.Until; index++ {
		value := surges.values[index]
		if Present(value) && !surges.isClaimed(index) && (peakIndex < 0 || value > surges.values[peakIndex]) {
			peakIndex = index
		}
	}

	return peakIndex, peakIndex >= 0
}

// episodeAround widens a run outwards from the peak while the neighbours are present, above the
// bar a fraction of the way from the median to that peak, and not already part of another surge.
//
// The surge then claims more than the run it reports: its slopes too, down to where the series is
// back at its median. The bar sits well above that, so the shoulder just under it would otherwise
// be the highest unclaimed peak of the next round, and one surge would come back as a run of
// adjacent episodes, each the flank of the one before. The slopes end at the median rather than at
// the level a later peak has to stand out from, because noise on a slope dips under that level
// long before the slope is over and would leave the rest of it unclaimed.
func (surges *surgeSearch) episodeAround(peakIndex int) Episode {
	peak := surges.values[peakIndex]
	bar := surges.median + float64((peak-surges.median)*surges.parameters.ThresholdFraction)

	run := surges.widen(Range{From: peakIndex, Until: peakIndex}, func(value float64) bool { return value > bar })
	slopes := surges.widen(run, func(value float64) bool { return value > surges.median })

	for index := slopes.From; index <= slopes.Until; index++ {
		surges.claimed[index-surges.clamped.From] = true
	}

	return excursionEpisode(surges.values, run, peak, surges.median, surges.scale)
}

// widen grows a run left and right while the neighbours are present, unclaimed and belong.
func (surges *surgeSearch) widen(run Range, belongs func(value float64) bool) Range {
	free := func(index int) bool {
		return Present(surges.values[index]) && !surges.isClaimed(index) && belongs(surges.values[index])
	}

	for run.From > surges.clamped.From && free(run.From-1) {
		run.From--
	}

	for run.Until < surges.clamped.Until && free(run.Until+1) {
		run.Until++
	}

	return run
}

func excursionEpisode(values []float64, run Range, peak, median, scale float64) Episode {
	mean, _ := MeanOf(values, run)
	magnitude := zScore(peak-median, scale)

	return spanning(run, Episode{
		Base:       values[run.From],
		Peak:       peak,
		Mean:       mean,
		Median:     median,
		Direction:  domain.DirectionRising,
		Magnitude:  magnitude,
		Pronounced: magnitude >= pronouncedExcursionBars,
	})
}

func clearsGuards(peak, median float64, parameters ExcursionParameters) bool {
	if parameters.PeakAtLeast != nil && peak < *parameters.PeakAtLeast {
		return false
	}

	return parameters.PeakOverMedian == nil || peak >= float64(median*(*parameters.PeakOverMedian))
}
