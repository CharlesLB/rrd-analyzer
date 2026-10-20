package engine

import (
	"cmp"
	"fmt"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const findingIDPrefix = "fd"

// finish ranks by severity, then start, then rule and anchor order so equal findings keep a stable
// order, drops a finding that overlaps an already kept finding of the same rule or a finding of a
// rule that supersedes its own, and numbers what remains.
func finish(candidates []candidate, warnings []string) Output {
	slices.SortStableFunc(candidates, func(left, right candidate) int {
		return cmp.Or(
			cmp.Compare(left.rule.Severity.Rank(), right.rule.Severity.Rank()),
			cmp.Compare(left.finding.FromMilliseconds, right.finding.FromMilliseconds),
			cmp.Compare(left.ruleIndex, right.ruleIndex),
			cmp.Compare(left.anchorOrder, right.anchorOrder),
		)
	})

	distinct := make([]candidate, 0, len(candidates))

	for _, found := range candidates {
		if !slices.ContainsFunc(distinct, func(kept candidate) bool { return duplicates(kept.finding, found.finding) }) {
			distinct = append(distinct, found)
		}
	}

	findings := make([]domain.Finding, 0, len(distinct))

	for _, found := range distinct {
		if slices.ContainsFunc(distinct, func(other candidate) bool { return supersedes(other, found) }) {
			continue
		}

		found.finding.ID = fmt.Sprintf("%s%d", findingIDPrefix, len(findings))
		findings = append(findings, found.finding)
	}

	unique := make([]string, 0, len(warnings))
	for _, warning := range warnings {
		if !slices.Contains(unique, warning) {
			unique = append(unique, warning)
		}
	}

	return Output{Findings: findings, Warnings: unique}
}

func duplicates(kept, finding domain.Finding) bool {
	return kept.RuleID == finding.RuleID && overlapping(kept, finding)
}

func supersedes(specific, general candidate) bool {
	return slices.Contains(specific.rule.Supersedes, general.rule.ID) && overlapping(specific.finding, general.finding)
}

func overlapping(one, other domain.Finding) bool {
	sameSpan := one.FromMilliseconds == other.FromMilliseconds && one.UntilMilliseconds == other.UntilMilliseconds

	return sameSpan || (other.FromMilliseconds < one.UntilMilliseconds && other.UntilMilliseconds > one.FromMilliseconds)
}
