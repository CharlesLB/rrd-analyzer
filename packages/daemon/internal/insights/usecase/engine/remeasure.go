package engine

import (
	"context"
	"maps"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// remeasure reads each short episode of a finding kept at the coarse step again at the finest step,
// around itself, and takes the fine episode overlapping it most. The joins and the span of the
// finding stay what pass one found; the numbers the cause quotes come from the finest data.
func (scan twoPassScan) remeasure(callerContext context.Context, found candidate) (candidate, error) {
	rule := scan.ruleset[found.ruleIndex]
	matches := maps.Clone(found.matches)
	changed := false

	for _, condition := range rule.ordered {
		matched, isMatched := matches[condition.Alias]
		if !isMatched || !remeasurable(condition, matched) {
			continue
		}

		margin := matched.end - matched.onset + regionCoarseSteps*scan.coarseStep
		region := scan.input.Window.around(matched.onset, matched.end, margin, margin)

		planned := []need{{series: matched.binding.series, function: condition.Function}}
		if !fitsBudget(planned, region, noLookback, scan.input.FineSampleBudget) {
			continue
		}

		fineFrames, _, err := scan.source.read(callerContext, planned, region, noLookback, atFinestStep)
		if err != nil {
			return candidate{}, err
		}

		if fine, overlaps := overlappingMost(newEvaluator(scan.input, fineFrames, region).episodesInWindow(found.ruleIndex, rule, condition), matched); overlaps {
			matches[condition.Alias] = fine
			changed = true
		}
	}

	if !changed {
		return found, nil
	}

	return assemble(scan.input.Window, found.ruleIndex, found.anchorOrder, rule, matches, found.outcome), nil
}

// remeasurable says whether an episode can be read again on its own. One found by looking back from
// the anchor, a burst, an inferred outage or reset, and a percentage of other series or of the
// series' own median all depend on more than the stretch around the episode.
func remeasurable(condition domain.Condition, matched located) bool {
	dependsOnMore := condition.LookbackMilliseconds > 0 || condition.Repeats > 0 || condition.Type == domain.TypeSystemDown ||
		(condition.When.Percent && (condition.PercentOf.Kind == domain.PercentSum || condition.PercentOf.Kind == domain.PercentMedian))
	withoutValues := matched.episode.Direction == domain.DirectionGap || matched.episode.Direction == domain.DirectionReset

	return !dependsOnMore && !withoutValues && matched.binding.frame.Samples.StepMilliseconds > stepOf(matched.binding.series)
}

// overlappingMost is the fine episode sharing the most time with a coarse one. A coarse episode's
// instants are bucket stamps, so it is taken to reach one bucket beyond each of them.
func overlappingMost(fine []located, coarse located) (located, bool) {
	best, found, bestOverlap := located{}, false, int64(-1)
	bucket := coarse.binding.frame.Samples.StepMilliseconds

	for _, option := range fine {
		overlap := min(option.end, coarse.end+bucket) - max(option.onset, coarse.onset-bucket)
		if option.binding.series.ID != coarse.binding.series.ID || overlap < 0 {
			continue
		}

		if overlap > bestOverlap || (overlap == bestOverlap && option.episode.Magnitude > best.episode.Magnitude) {
			best, found, bestOverlap = option, true, overlap
		}
	}

	return best, found
}
