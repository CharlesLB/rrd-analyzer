package engine

import (
	"fmt"
	"math"
	"slices"
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const percentScale = 100

// measuredValues is one series as a condition measures it: the values, the unit they are in, and
// whether the denominator a percentage needs was resolved at all. The zero value is the
// unresolved case, which leaves the series out of the condition.
type measuredValues struct {
	values   []float64
	unit     string
	resolved bool
}

// companionFrames is the set of series whose sum forms a percentage's denominator, or the reason
// there is no such set.
type companionFrames struct {
	frames     []Frame
	unresolved string
}

func (evaluation *evaluator) bindings(ruleIndex int, rule compiledRule, condition domain.Condition) []binding {
	key := conditionKey{ruleIndex: ruleIndex, alias: condition.Alias}
	if cached, known := evaluation.bindingsByCondition[key]; known {
		return cached
	}

	var bound []binding

	for order, classified := range boundSeries(evaluation.input.Classification, condition) {
		series := classified.Series

		frame, loaded := evaluation.frames[frameKey{seriesID: series.ID, function: condition.Function}]
		if !loaded {
			continue
		}

		measured := evaluation.percentValues(rule, condition, frame)
		if !measured.resolved {
			continue
		}

		bound = append(bound, binding{
			order: order, series: series, semanticType: classified.Type, frame: frame, values: measured.values, unit: measured.unit,
		})
	}

	evaluation.bindingsByCondition[key] = bound

	return bound
}

// percentValues expresses a series as a percentage when the condition asks for one. A denominator
// that cannot be resolved leaves the series out of the condition with a warning: a percentage is
// never guessed.
func (evaluation *evaluator) percentValues(rule compiledRule, condition domain.Condition, frame Frame) measuredValues {
	if !condition.When.Percent {
		return measuredValues{values: frame.Samples.Values, unit: frame.Series.Unit, resolved: true}
	}

	scaled := evaluation.percentageOf(condition, frame)
	if scaled.unresolved != "" {
		evaluation.warn(rule, frame.Series, scaled.unresolved)
	}

	return scaled.measured
}

// percentage is one frame scaled against one denominator, or the reason it could not be.
type percentage struct {
	measured   measuredValues
	unresolved string
}

// percentageKey names a scaling: the frame and what it is a percentage of. The rule is not part of
// it, since the same series as a percentage of the same thing is the same numbers whoever asks.
type percentageKey struct {
	frame       frameKey
	kind        domain.PercentKind
	denominator string
}

const sumTypeSeparator = "+"

// percentageOf scales a frame once however many rules and conditions measure it against the same
// denominator. Several default rules read memory or CPU as the same percentage, and each used to
// build its own copy of the whole scaled series. A percentage of the series' own median names no
// other series, so its key is the frame alone and the median of a frame is taken once as well.
func (evaluation *evaluator) percentageOf(condition domain.Condition, frame Frame) percentage {
	key := percentageKey{
		frame:       frameKey{seriesID: frame.Series.ID, function: condition.Function},
		kind:        condition.PercentOf.Kind,
		denominator: strings.Join(condition.PercentOf.Sum, sumTypeSeparator),
	}

	if cached, known := evaluation.percentages[key]; known {
		return cached
	}

	scaled := evaluation.scaleToPercent(condition, frame)
	evaluation.percentages[key] = scaled

	return scaled
}

func (evaluation *evaluator) scaleToPercent(condition domain.Condition, frame Frame) percentage {
	values := frame.Samples.Values

	switch condition.PercentOf.Kind {
	case domain.PercentDataSourceMaximum:
		maximum := frame.Series.DataSourceMaximum
		if maximum == nil || !(*maximum > 0) {
			return percentage{unresolved: "the data source declares no maximum"}
		}

		return asPercent(scaleValues(values, func(int) float64 { return *maximum }))
	case domain.PercentSum:
		companions := evaluation.companions(condition, frame)
		if companions.unresolved != "" {
			return percentage{unresolved: companions.unresolved}
		}

		return asPercent(scaleValues(values, func(index int) float64 { return sumAt(companions.frames, frame.instantOf(index)) }))
	case domain.PercentMedian:
		median, found := signal.MedianOf(values, signal.Range{From: 0, Until: len(values) - 1})
		if !found || !(median > 0) {
			return percentage{unresolved: "the series has no positive median to measure against"}
		}

		return asPercent(scaleValues(values, func(int) float64 { return median }))
	default:
		return asPercent(values)
	}
}

func asPercent(values []float64) percentage {
	return percentage{measured: measuredValues{values: values, unit: seriesDomain.UnitPercent, resolved: true}}
}

func (evaluation *evaluator) warn(rule compiledRule, series domain.SeriesInfo, reason string) {
	message := fmt.Sprintf("rule %s: percent denominator unresolved on %s (%s): %s", rule.ID, series.File, series.DataSource, reason)
	if !slices.Contains(evaluation.warnings, message) {
		evaluation.warnings = append(evaluation.warnings, message)
	}
}

func (evaluation *evaluator) companions(condition domain.Condition, own Frame) companionFrames {
	companions := make([]Frame, 0, len(condition.PercentOf.Sum))

	for _, companionType := range condition.PercentOf.Sum {
		candidates := evaluation.input.Classification.SeriesOfType(companionType)

		chosen := slices.IndexFunc(candidates, func(series domain.SeriesInfo) bool { return series.File == own.Series.File })
		if chosen < 0 && len(candidates) == 1 {
			chosen = 0
		}

		if chosen < 0 {
			return companionFrames{unresolved: fmt.Sprintf("no single %s series to add to the denominator", companionType)}
		}

		frame, loaded := evaluation.frames[frameKey{seriesID: candidates[chosen].ID, function: condition.Function}]
		if !loaded || frame.Samples.StepMilliseconds != own.Samples.StepMilliseconds {
			return companionFrames{unresolved: fmt.Sprintf("the %s series has no samples on the same step", companionType)}
		}

		companions = append(companions, frame)
	}

	return companionFrames{frames: companions}
}

func sumAt(companions []Frame, instant int64) float64 {
	total := 0.0

	for _, companion := range companions {
		index := companion.indexOf(instant)
		if index < 0 || index >= len(companion.Samples.Values) || !signal.Present(companion.Samples.Values[index]) {
			return math.NaN()
		}

		total += companion.Samples.Values[index]
	}

	return total
}

func scaleValues(values []float64, denominatorAt func(index int) float64) []float64 {
	scaled := make([]float64, len(values))

	for index, value := range values {
		denominator := denominatorAt(index)
		scaled[index] = math.NaN()

		if signal.Present(value) && signal.Present(denominator) && denominator > 0 {
			scaled[index] = percentScale * value / denominator
		}
	}

	return scaled
}
