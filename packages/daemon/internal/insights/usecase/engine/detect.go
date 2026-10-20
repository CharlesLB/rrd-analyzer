package engine

import (
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

// flatArchiveRows is how many rows of the coarsest archive behind a frame a flat run has to outlast.
// One coarse row laid across a finer grid repeats itself, and is flat by construction.
const flatArchiveRows = 2

// detect runs the condition's detector, keeps only the bursts of what it found when the condition
// asks for repeats, and only what heads on to the forecast level when it asks for one.
//
// The range is cut to the frame before anything measures it: a lookback from an anchor near the
// start of the data reaches before the first sample, and a duration counted over samples that are
// not there would let a drift pass for having lasted long enough.
func detect(condition domain.Condition, bound binding, searched signal.Range) []signal.Episode {
	searched, overlaps := searched.Within(len(bound.values))
	if !overlaps {
		return nil
	}

	episodes := detectEpisodes(condition, bound, searched)
	step := bound.frame.Samples.StepMilliseconds

	if condition.Repeats > 0 {
		episodes = signal.Bursts(episodes, condition.Repeats, samplesIn(condition.RepeatsWithinMilliseconds, step, samplesFitting))
	}

	if condition.ForecastLevel == nil {
		return episodes
	}

	forecast := make([]signal.Episode, 0, len(episodes))

	for _, episode := range episodes {
		samples, reaches := signal.SamplesToLevel(bound.values, episode, *condition.ForecastLevel)
		if !reaches || (condition.ForecastWithinMilliseconds > 0 && samples*float64(step) > float64(condition.ForecastWithinMilliseconds)) {
			continue
		}

		episode.SamplesToLevel, episode.HasForecast = samples, true
		forecast = append(forecast, episode)
	}

	return forecast
}

func detectEpisodes(condition domain.Condition, bound binding, searched signal.Range) []signal.Episode {
	parameters := condition.Parameters
	values := bound.values
	step := bound.frame.Samples.StepMilliseconds

	switch condition.When.Detector {
	case domain.DetectorDown:
		episodes := signal.Gaps(values, searched, gapRun(parameters, step))
		if bound.semanticType == domain.TypeSystemUp {
			episodes = append(episodes, signal.Resets(values, searched, parameters.DropFraction)...)
		}

		return episodes
	case domain.DetectorGap:
		return signal.Gaps(values, searched, gapRun(parameters, step))
	case domain.DetectorReset:
		if condition.Type == domain.TypeSystemDown && bound.semanticType != domain.TypeSystemUp {
			return nil
		}

		return signal.Resets(values, searched, parameters.DropFraction)
	case domain.DetectorExcursion:
		return signal.Excursions(values, searched, signal.ExcursionParameters{
			ThresholdFraction: parameters.ThresholdFraction,
			MinimumSamples:    parameters.MinimumSamples,
			PeakAtLeast:       parameters.PeakAtLeast,
			PeakOverMedian:    parameters.PeakOverMedian,
			MaximumEpisodes:   max(1, parameters.MaximumEpisodes),
		})
	case domain.DetectorDrift:
		if int64(searched.Until-searched.From)*step < parameters.MinimumDurationMilliseconds {
			return nil
		}

		return single(signal.Drift(values, searched, signal.DriftParameters{
			Ratio:              parameters.Ratio,
			EdgeFraction:       parameters.EdgeFraction,
			MinimumEdgeSamples: parameters.MinimumEdgeSamples,
		}))
	case domain.DetectorThreshold:
		return signal.Thresholds(values, searched, signal.ThresholdParameters{
			Comparison:     condition.When.Comparison,
			Level:          condition.When.Level,
			MinimumSamples: samplesIn(parameters.MinimumDurationMilliseconds, step, samplesCovering),
		})
	case domain.DetectorFlat:
		minimumDuration := max(parameters.MinimumDurationMilliseconds, flatArchiveRows*bound.frame.resolution())

		return signal.Flats(values, searched, signal.FlatParameters{
			Tolerance:      parameters.Tolerance,
			MinimumSamples: samplesIn(minimumDuration, step, samplesCovering),
		})
	case domain.DetectorRising, domain.DetectorFalling:
		return signal.Trends(values, searched, signal.TrendParameters{
			Direction:        domain.Direction(condition.When.Detector),
			SmoothingSamples: samplesFittingOr(parameters.SmoothingMilliseconds, step, signal.DefaultSmoothingSamples),
			Theta:            parameters.Theta,
			Sustain:          parameters.Sustain,
		})
	case domain.DetectorChangePoint:
		return signal.ChangePoints(values, searched, signal.ChangePointParameters{
			SmoothingSamples: samplesFittingOr(parameters.SmoothingMilliseconds, step, signal.DefaultChangePointSmoothing),
			Theta:            parameters.Theta,
			Sustain:          parameters.Sustain,
		})
	case domain.DetectorSpike:
		return signal.Spikes(values, searched, signal.SpikeParameters{
			Level:          parameters.Level,
			Theta:          parameters.Theta,
			MaximumSamples: samplesFittingOr(parameters.MaximumDurationMilliseconds, step, signal.DefaultSpikeMaximumRun),
		})
	default:
		return nil
	}
}

func single(episode signal.Episode, found bool) []signal.Episode {
	if !found {
		return nil
	}

	return []signal.Episode{episode}
}

// gapRun is how many holes make a gap: the minimum duration when the condition gives one, so the same
// rule means the same outage at a minute and at an hour, and otherwise the minimum run.
func gapRun(parameters domain.DetectorParameters, step int64) int {
	if parameters.MinimumDurationMilliseconds > 0 {
		return samplesIn(parameters.MinimumDurationMilliseconds, step, samplesCovering)
	}

	return parameters.MinimumRun
}
