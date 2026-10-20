package engine

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"

const (
	confidenceLow    = 0
	confidenceMedium = 1
	confidenceHigh   = 2
)

var confidenceLevels = []domain.Confidence{domain.ConfidenceLow, domain.ConfidenceMedium, domain.ConfidenceHigh}

// inferred marks a finding whose claim rests on data that is missing rather than on data that was
// observed: a gap or a counter reset stands in for the moment reporting stopped.
func inferred(rule compiledRule, matches map[string]located) bool {
	if rule.Inferred {
		return true
	}

	for _, matched := range matches {
		if matched.episode.Direction == domain.DirectionGap || matched.episode.Direction == domain.DirectionReset {
			return true
		}
	}

	return false
}

// confidenceOf grades a finding on deterministic cues; it is an ordinal, never a probability.
// It starts at high and drops one level for every weak cue, never below low:
//   - a matched episode that does not clear its own detector's bar for a pronounced signal (a gap
//     shorter than twice its minimum run, an excursion under three robust deviations, …);
//   - an after constraint that held only loosely: the onset came no more than one bucket after
//     its predecessor, which is inside the resolution of the data, or it came in the second half
//     of the within allowance.
//
// Two cues cap it at medium whatever the rest says: an ordering the data was too coarse to verify
// (a within shorter than the step it was read at), and an optional condition that found nothing.
func confidenceOf(rule compiledRule, matches map[string]located, outcome joinOutcome) domain.Confidence {
	level := confidenceHigh

	for _, condition := range rule.ordered {
		matched, found := matches[condition.Alias]
		if !found {
			continue
		}

		if !matched.episode.Pronounced {
			level--
		}

		predecessor, ordered := matches[condition.After]
		if condition.After == "" || !ordered {
			continue
		}

		lag := matched.onset - predecessor.onset
		step := max(matched.binding.frame.resolution(), predecessor.binding.frame.resolution())

		if lag <= step || (condition.WithinMilliseconds > 0 && 2*lag > condition.WithinMilliseconds) {
			level--
		}
	}

	level = max(level, confidenceLow)
	if outcome.unverifiable || outcome.missedOptional {
		level = min(level, confidenceMedium)
	}

	return confidenceLevels[level]
}
