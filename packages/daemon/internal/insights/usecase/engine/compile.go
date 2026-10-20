package engine

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"

// compiledRule is a rule with what every pass of a scan asks of it worked out once: the order the
// causal join visits its conditions in, and how far back any of them looks. The join, the planner,
// the confidence grade and the refinement each walk the conditions many times per anchor.
type compiledRule struct {
	domain.Rule

	ordered  []domain.Condition
	lookback int64
}

func compileRule(rule domain.Rule) compiledRule {
	ordered := rule.EvaluationOrder()
	lookback := int64(0)

	for _, condition := range ordered {
		lookback = max(lookback, condition.LookbackMilliseconds)
	}

	return compiledRule{Rule: rule, ordered: ordered, lookback: lookback}
}

func compile(ruleset []domain.Rule) []compiledRule {
	compiled := make([]compiledRule, 0, len(ruleset))
	for _, rule := range ruleset {
		compiled = append(compiled, compileRule(rule))
	}

	return compiled
}
