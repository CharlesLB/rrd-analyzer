package rules

import (
	"fmt"
	"maps"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const (
	keyRepeats        = "repeats"
	keyRepeatsWithin  = "repeats_within"
	keyForecastLevel  = "forecast_level"
	keyForecastWithin = "forecast_within"

	minimumRepeats = 2
)

func (checker *checker) condition(document conditionDocument, percentOf any, position string) domain.Condition {
	condition := domain.Condition{
		Alias:    document.As,
		Type:     document.Type,
		Optional: document.Optional,
		After:    document.After,
		Overlaps: document.Overlaps,
		Since:    document.Since,
	}

	if condition.Alias == "" {
		condition.Alias = document.Type
	}

	location := fmt.Sprintf("%s (%s)", position, condition.Alias)

	switch {
	case document.Type == "":
		checker.add(missingField, position+" needs a type")
	case !checker.knownTypes[document.Type]:
		checker.add(unknownType, fmt.Sprintf("%s: type %q is not produced by the classifier", location, document.Type))
	}

	if condition.Alias != "" && !validAlias(condition.Alias) {
		checker.add(invalidAlias, fmt.Sprintf("%s: alias %q must be dotted lower-case words and not window or finding", location, condition.Alias))
	}

	condition.When = checker.when(document, location)
	condition.Function = checker.function(document.Function, condition.When, location)
	condition.LookbackMilliseconds = checker.duration("lookback", document.Lookback, location)
	condition.WithinMilliseconds = checker.duration("within", document.Within, location)

	if document.Within != "" && document.After == "" {
		checker.add(invalidReference, location+": within bounds an after, and there is no after")
	}

	if document.Since != "" && document.Lookback == "" {
		checker.add(invalidReference, location+": since starts a lookback, and there is no lookback")
	}

	condition.Parameters = checker.parameters(document, condition.When.Detector, location)
	condition.PercentOf = checker.percentOf(percentOf, condition.When, location)
	condition.Repeats, condition.RepeatsWithinMilliseconds = checker.repeats(document, location)
	condition.ForecastLevel, condition.ForecastWithinMilliseconds = checker.forecast(document, location)

	return condition
}

// forecast reads the level a condition projects its episodes to. A horizon without a level has
// nothing to reach.
func (checker *checker) forecast(document conditionDocument, location string) (*float64, int64) {
	within := checker.duration(keyForecastWithin, document.ForecastWithin, location)

	if document.ForecastLevel == nil {
		if document.ForecastWithin != "" {
			checker.add(invalidParameter, fmt.Sprintf("%s: %s bounds a %s, and there is no %s", location, keyForecastWithin, keyForecastLevel, keyForecastLevel))
		}

		return nil, 0
	}

	return checker.finite(keyForecastLevel, document.ForecastLevel, location), within
}

// repeats reads the burst a condition asks for. Both keys go together: a count of episodes means
// nothing without the span they must fall in, and a span without a count keeps nothing out.
func (checker *checker) repeats(document conditionDocument, location string) (int, int64) {
	within := checker.duration(keyRepeatsWithin, document.RepeatsWithin, location)

	switch {
	case document.Repeats == nil && document.RepeatsWithin == "":
		return 0, 0
	case document.Repeats == nil:
		checker.add(invalidParameter, fmt.Sprintf("%s: %s bounds a %s, and there is no %s", location, keyRepeatsWithin, keyRepeats, keyRepeats))

		return 0, 0
	case *document.Repeats < minimumRepeats:
		checker.add(invalidParameter, fmt.Sprintf("%s: %s must be at least %d, got %d", location, keyRepeats, minimumRepeats, *document.Repeats))
	case document.RepeatsWithin == "":
		checker.add(invalidParameter, fmt.Sprintf("%s: %s needs %s to say how close together they must be", location, keyRepeats, keyRepeatsWithin))
	}

	return *document.Repeats, within
}

func (checker *checker) when(document conditionDocument, location string) domain.When {
	if document.When == "" {
		if document.Type == domain.TypeSystemDown {
			return domain.When{Detector: domain.DetectorDown}
		}

		checker.add(missingField, location+" needs a when")

		return domain.When{}
	}

	when, err := ParseWhen(document.When)
	if err != nil {
		checker.add(unknownWhen, fmt.Sprintf("%s: %v", location, err))
	}

	return when
}

// function picks the archive a condition reads. Peaks only survive consolidation in MAX and
// floors only in MIN, so spikes and below-level conditions default to those.
func (checker *checker) function(declared string, when domain.When, location string) string {
	switch declared {
	case domain.FunctionAverage, domain.FunctionMinimum, domain.FunctionMaximum, domain.FunctionLast:
		return declared
	case "":
	default:
		checker.add(unknownFunction, fmt.Sprintf("%s: cf %q must be AVERAGE, MIN, MAX or LAST", location, declared))
	}

	switch {
	case when.Detector == domain.DetectorSpike:
		return domain.FunctionMaximum
	case when.Detector == domain.DetectorThreshold && when.Comparison == domain.ComparisonBelow:
		return domain.FunctionMinimum
	default:
		return domain.FunctionAverage
	}
}

func (checker *checker) duration(key, text, location string) int64 {
	if text == "" {
		return 0
	}

	milliseconds, err := ParseDuration(text)
	if err != nil {
		checker.add(malformedDuration, fmt.Sprintf("%s: %s: %v", location, key, err))
	}

	return milliseconds
}

func (checker *checker) percentOf(raw any, when domain.When, location string) domain.PercentOf {
	if raw == nil {
		if when.Percent {
			checker.add(invalidPercentOf, location+": a percentage needs percent_of to say what it is a percentage of")
		}

		return domain.PercentOf{}
	}

	if !when.Percent {
		checker.add(invalidPercentOf, location+": percent_of only applies to a > X% or < X% condition")

		return domain.PercentOf{}
	}

	switch value := raw.(type) {
	case string:
		kind := domain.PercentKind(value)
		if kind == domain.PercentSelf || kind == domain.PercentDataSourceMaximum || kind == domain.PercentMedian {
			return domain.PercentOf{Kind: kind}
		}
	case map[string]any:
		return checker.percentSum(value, location)
	}

	checker.add(invalidPercentOf, location+`: percent_of must be "self", "ds.max", "median" or { sum = [types] }`)

	return domain.PercentOf{}
}

func (checker *checker) percentSum(table map[string]any, location string) domain.PercentOf {
	for _, key := range slices.Sorted(maps.Keys(table)) {
		if key != percentSumKey {
			checker.add(unknownKey, fmt.Sprintf("%s: key %q is not part of percent_of", location, key))
		}
	}

	listed, isList := table[percentSumKey].([]any)
	if !isList || len(listed) == 0 {
		checker.add(invalidPercentOf, location+": percent_of.sum must list at least one type")

		return domain.PercentOf{}
	}

	sum := make([]string, 0, len(listed))

	for _, item := range listed {
		semanticType, isText := item.(string)
		if !isText || !checker.knownTypes[semanticType] || semanticType == domain.TypeSystemDown {
			checker.add(unknownType, fmt.Sprintf("%s: percent_of.sum entry %v is not a classifier type", location, item))

			continue
		}

		sum = append(sum, semanticType)
	}

	return domain.PercentOf{Kind: domain.PercentSum, Sum: sum}
}
