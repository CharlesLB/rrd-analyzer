package engine

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

const (
	memoStep     = int64(60000)
	memoFunction = domain.FunctionAverage
)

// memoEvaluator is an evaluator over one series of sixty samples holding a ten-sample outage, and
// that series as the join sees it.
func memoEvaluator(maximum float64) (*evaluator, Frame) {
	values := make([]float64, 60)
	for index := range values {
		values[index] = 50

		if index >= 20 && index < 30 {
			values[index] = math.NaN()
		}
	}

	series := domain.SeriesInfo{ID: "memory", File: "memory.rrd", DataSource: "used", StepMilliseconds: memoStep, DataSourceMaximum: &maximum}
	frame := Frame{Series: series, Samples: domain.Samples{StepMilliseconds: memoStep, ArchiveStepMilliseconds: memoStep, Function: memoFunction, Values: values}}
	loaded := frames{frameKey{seriesID: series.ID, function: memoFunction}: frame}

	input := Input{Classification: classify.Result{Classified: []classify.Classified{{Series: series, Type: "memory.used"}}}}

	return newEvaluator(input, loaded, Window{UntilMilliseconds: 59 * memoStep}), frame
}

func sameBacking[Element any](left, right []Element) bool {
	return len(left) > 0 && len(left) == len(right) && &left[0] == &right[0]
}

func TestLookedBack_SameConditionSeriesAndStretch_IsDetectedOnce(t *testing.T) {
	evaluation, frame := memoEvaluator(100)

	condition := domain.Condition{Alias: "outage", Type: "memory.used", Function: memoFunction, When: domain.When{Detector: domain.DetectorGap}, Parameters: domain.DetectorParameters{MinimumRun: 6}}
	bound := binding{series: frame.Series, frame: frame, values: frame.Samples.Values}
	key := conditionKey{alias: condition.Alias}
	searched := signal.Range{From: 0, Until: 40}

	first := evaluation.lookedBack(key, condition, bound, searched)
	again := evaluation.lookedBack(key, condition, bound, searched)

	if len(first) != 1 || !sameBacking(first, again) {
		t.Errorf("lookedBack twice = %+v and %+v, want the one outage, detected once and handed out twice", first, again)
	}

	if narrower := evaluation.lookedBack(key, condition, bound, signal.Range{From: 0, Until: 10}); len(narrower) != 0 {
		t.Errorf("lookedBack over a stretch before the outage = %+v, want nothing: another stretch is another detection", narrower)
	}
}

func TestPercentValues_TwoRulesMeasuringTheSamePercentage_ShareOneScaledSeries(t *testing.T) {
	evaluation, frame := memoEvaluator(200)

	condition := domain.Condition{
		Alias: "memory", Type: "memory.used", Function: memoFunction,
		When:      domain.When{Detector: domain.DetectorThreshold, Comparison: domain.ComparisonAbove, Level: 90, Percent: true},
		PercentOf: domain.PercentOf{Kind: domain.PercentDataSourceMaximum},
	}

	first := evaluation.percentValues(compiledRule{Rule: domain.Rule{ID: "one"}}, condition, frame)
	second := evaluation.percentValues(compiledRule{Rule: domain.Rule{ID: "other"}}, condition, frame)

	if !first.resolved || first.values[0] != 25 || !sameBacking(first.values, second.values) {
		t.Errorf("percentValues = %v then %v, want 50 of 200 as 25%%, scaled once for both rules", first.values[:1], second.values[:1])
	}

	ofItself := condition
	ofItself.PercentOf = domain.PercentOf{Kind: domain.PercentSelf}

	if unscaled := evaluation.percentValues(compiledRule{}, ofItself, frame); unscaled.values[0] != 50 {
		t.Errorf("percentValues of itself = %v, want the readings as they are: another denominator is another scaling", unscaled.values[0])
	}
}

func TestPercentValues_UnresolvedDenominator_WarnsForEveryRuleThatAsked(t *testing.T) {
	evaluation, frame := memoEvaluator(0)

	condition := domain.Condition{
		Alias: "memory", Type: "memory.used", Function: memoFunction,
		When:      domain.When{Detector: domain.DetectorThreshold, Comparison: domain.ComparisonAbove, Level: 90, Percent: true},
		PercentOf: domain.PercentOf{Kind: domain.PercentDataSourceMaximum},
	}

	for _, ruleID := range []string{"one", "other"} {
		if measured := evaluation.percentValues(compiledRule{Rule: domain.Rule{ID: ruleID}}, condition, frame); measured.resolved {
			t.Errorf("percentValues for rule %s resolved against a maximum of zero", ruleID)
		}
	}

	if len(evaluation.warnings) != 2 {
		t.Errorf("warnings = %q, want one for each rule though the scaling was tried once", evaluation.warnings)
	}
}
