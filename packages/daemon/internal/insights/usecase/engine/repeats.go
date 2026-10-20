package engine

import (
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// countableCoarseBuckets is how many coarse buckets repeats have to be allowed to spread over
// before pass one counts them itself. Restarts days apart stand apart at any coarse step; three
// in twenty minutes average into one bucket.
const countableCoarseBuckets = 10

// withoutFineRepeats is the ruleset pass one evaluates: every condition whose repeats only a fine
// read can count looks for a single episode instead.
func withoutFineRepeats(ruleset []compiledRule, coarseStep int64) []compiledRule {
	relaxed := slices.Clone(ruleset)

	for index, compiled := range relaxed {
		if !countsFineRepeats(compiled, coarseStep) {
			continue
		}

		rule := compiled.Rule
		rule.Conditions = slices.Clone(rule.Conditions)
		for position := range rule.Conditions {
			rule.Conditions[position] = withoutFineRepeat(rule.Conditions[position], coarseStep)
		}

		if rule.Trigger != nil {
			trigger := withoutFineRepeat(*rule.Trigger, coarseStep)
			rule.Trigger = &trigger
		}

		relaxed[index] = compileRule(rule)
	}

	return relaxed
}

func withoutFineRepeat(condition domain.Condition, coarseStep int64) domain.Condition {
	if countsFinely(condition, coarseStep) {
		condition.Repeats, condition.RepeatsWithinMilliseconds = 0, 0
	}

	return condition
}

func countsFinely(condition domain.Condition, coarseStep int64) bool {
	return condition.Repeats > 0 && condition.RepeatsWithinMilliseconds < countableCoarseBuckets*coarseStep
}

func countsCoarseRepeats(rule compiledRule, coarseStep int64) bool {
	return slices.ContainsFunc(rule.ordered, func(condition domain.Condition) bool {
		return condition.Repeats > 0 && !countsFinely(condition, coarseStep)
	})
}

func countsFineRepeats(rule compiledRule, coarseStep int64) bool {
	return longestFineRepeatsWithin(rule, coarseStep) > 0
}

func longestFineRepeatsWithin(rule compiledRule, coarseStep int64) int64 {
	longest := int64(0)

	for _, condition := range rule.ordered {
		if countsFinely(condition, coarseStep) {
			longest = max(longest, condition.RepeatsWithinMilliseconds)
		}
	}

	return longest
}
