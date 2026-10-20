package rules

import "maps"

const (
	documentArrayKey = "rule"
	triggerKey       = "trigger"
	conditionKey     = "condition"
	percentOfKey     = "percent_of"
	percentSumKey    = "sum"
)

// ruleDocument is one [[rule]] table as a person writes it. Nothing here is checked yet: the
// checker reads it into a domain.Rule and reports what it cannot accept.
type ruleDocument struct {
	ID        string              `toml:"id"`
	Severity  string              `toml:"severity"`
	Title     string              `toml:"title"`
	Match     string              `toml:"match"`
	Inferred  bool                `toml:"inferred"`
	Interval  string              `toml:"interval"`
	Onset     []string            `toml:"onset"`
	End       []string            `toml:"end"`
	Anchor    string              `toml:"anchor"`
	Evidence  []string            `toml:"evidence"`
	Cause     string              `toml:"cause"`
	Condition []conditionDocument `toml:"condition"`
	Partial   *variantDocument    `toml:"partial"`

	Supersedes []string `toml:"supersedes"`
}

type variantDocument struct {
	Title string `toml:"title"`
	Match string `toml:"match"`
	Cause string `toml:"cause"`
}

type conditionDocument struct {
	As       string `toml:"as"`
	Type     string `toml:"type"`
	When     string `toml:"when"`
	Function string `toml:"cf"`
	Optional bool   `toml:"optional"`
	Lookback string `toml:"lookback"`
	After    string `toml:"after"`
	Within   string `toml:"within"`
	Overlaps string `toml:"overlaps"`

	Repeats        *int     `toml:"repeats"`
	RepeatsWithin  string   `toml:"repeats_within"`
	Since          string   `toml:"since"`
	ForecastLevel  *float64 `toml:"forecast_level"`
	ForecastWithin string   `toml:"forecast_within"`

	MinimumRun         *int     `toml:"min_run"`
	ThresholdFraction  *float64 `toml:"threshold_fraction"`
	MinimumSamples     *int     `toml:"min_samples"`
	PeakAtLeast        *float64 `toml:"peak_at_least"`
	PeakOverMedian     *float64 `toml:"peak_over_median"`
	Ratio              *float64 `toml:"ratio"`
	EdgeFraction       *float64 `toml:"edge_fraction"`
	MinimumEdgeSamples *int     `toml:"min_edge_samples"`
	Window             *string  `toml:"window"`
	Theta              *float64 `toml:"theta"`
	Sustain            *int     `toml:"sustain"`
	Level              *float64 `toml:"level"`
	MaximumDuration    *string  `toml:"max_duration"`
	MinimumDuration    *string  `toml:"min_duration"`
	DropFraction       *float64 `toml:"drop_fraction"`
	Tolerance          *float64 `toml:"tolerance"`
	MaximumEpisodes    *int     `toml:"max_episodes"`
}

// extractUntyped pulls out the keys whose value may be either a string or a table. Decoding those
// into an untyped field would leave their inner keys looking unknown, so they are parsed by hand.
func extractUntyped(table map[string]any) (map[string]any, any, []any) {
	stripped := maps.Clone(table)
	trigger := stripped[triggerKey]
	delete(stripped, triggerKey)

	conditions, isArrayOfTables := stripped[conditionKey].([]map[string]any)
	if !isArrayOfTables {
		return stripped, trigger, nil
	}

	cleaned := make([]map[string]any, len(conditions))
	percentOfs := make([]any, len(conditions))

	for index, condition := range conditions {
		cleaned[index], percentOfs[index] = withoutPercentOf(condition)
	}

	stripped[conditionKey] = cleaned

	return stripped, trigger, percentOfs
}

// withoutPercentOf is a condition table with its percent_of taken out, and that percent_of, which
// may be a string or a table and so is read by hand.
func withoutPercentOf(table map[string]any) (map[string]any, any) {
	cleaned := maps.Clone(table)
	percentOf := cleaned[percentOfKey]
	delete(cleaned, percentOfKey)

	return cleaned, percentOf
}
