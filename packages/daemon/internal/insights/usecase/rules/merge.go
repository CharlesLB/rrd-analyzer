package rules

import (
	"fmt"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/digest"
)

// Merge lays the user's rules over the defaults. A user rule with a default's id takes that
// default's place, so replacing a rule does not also reorder the list; new user rules follow.
func Merge(defaults, overrides []domain.Rule) []domain.Rule {
	merged := slices.Clone(defaults)
	positions := make(map[string]int, len(merged))

	for index, rule := range merged {
		positions[rule.ID] = index
	}

	for _, override := range overrides {
		if index, replaces := positions[override.ID]; replaces {
			merged[index] = override

			continue
		}

		positions[override.ID] = len(merged)
		merged = append(merged, override)
	}

	return merged
}

// Hash is a content hash of the parsed rules, taken after defaults were filled in: two files that
// spell the same rule differently hash the same, and a changed default changes the hash.
func Hash(rules []domain.Rule) (string, error) {
	hash, err := digest.OfJSON(rules)
	if err != nil {
		return "", fmt.Errorf("hash the ruleset: %w", err)
	}

	return hash, nil
}
