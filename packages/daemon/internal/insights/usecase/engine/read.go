package engine

import (
	"context"
	"fmt"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// noLookback reads a stretch with nothing before it but the sparkline's lead. A remeasured episode
// is read around itself; nothing is ever looked back for from it.
const noLookback int64 = 0

type frameKey struct {
	seriesID string
	function string
}

type frames map[frameKey]Frame

type need struct {
	series   domain.SeriesInfo
	function string
}

// plan lists every (series, consolidation) the rules read, in rule, condition and catalog order,
// each once. Percentages of a sum also read their companion series.
func plan(classification classify.Result, ruleset []compiledRule) []need {
	seen := map[frameKey]bool{}

	var needs []need

	add := func(series domain.SeriesInfo, function string) {
		key := frameKey{seriesID: series.ID, function: function}
		if !seen[key] {
			seen[key] = true
			needs = append(needs, need{series: series, function: function})
		}
	}

	for _, rule := range ruleset {
		for _, condition := range rule.ordered {
			for _, classified := range boundSeries(classification, condition) {
				add(classified.Series, condition.Function)
			}

			if condition.PercentOf.Kind != domain.PercentSum {
				continue
			}

			for _, companionType := range condition.PercentOf.Sum {
				for _, series := range classification.SeriesOfType(companionType) {
					add(series, condition.Function)
				}
			}
		}
	}

	return needs
}

// planEachRule is plan taken for every rule on its own, in ruleset order.
func planEachRule(classification classify.Result, ruleset []compiledRule) [][]need {
	needs := make([][]need, 0, len(ruleset))
	for _, rule := range ruleset {
		needs = append(needs, plan(classification, []compiledRule{rule}))
	}

	return needs
}

// boundSeries is what a condition reads, each series with its type. system.down is not a series
// type but an inference over all of them: any classified series going silent, or system.up
// resetting.
func boundSeries(classification classify.Result, condition domain.Condition) []classify.Classified {
	if condition.Type != domain.TypeSystemDown {
		return classification.OfType(condition.Type)
	}

	return classification.Classified
}

func longestLookback(ruleset []compiledRule) int64 {
	longest := int64(0)
	for _, rule := range ruleset {
		longest = max(longest, rule.lookback)
	}

	return longest
}

func stepOf(series domain.SeriesInfo) int64 {
	return max(series.StepMilliseconds, seriesDomain.MinimumStepMilliseconds)
}

// fitsBudget says whether every planned series can be read at its finest step within the budget
// over the stretch a read would cover: the window, the lookback before it and the sparkline
// margins around it, which for a rule looking back ten days is most of what is read.
func fitsBudget(needs []need, window Window, lookback int64, budget int) bool {
	for _, planned := range needs {
		step := stepOf(planned.series)
		if samplesAcross(readSpanOf(window, lookback, step), step) > int64(budget) {
			return false
		}
	}

	return true
}

// readSpanOf is the stretch read around a window: back by the longest lookback and the sparkline's
// lead, forward by its trail, and by the radius the sparkline smooths over past both, so evidence
// found near an edge draws the same line it would mid-window.
func readSpanOf(window Window, lookback, step int64) Window {
	return Window{
		FromMilliseconds:  window.FromMilliseconds - lookback - (gapSparkLeadSamples+signal.SparkSmoothingRadius)*step,
		UntilMilliseconds: window.UntilMilliseconds + (gapSparkTrailSamples+signal.SparkSmoothingRadius)*step,
	}
}

// samplesAcross is how many samples of the given step a stretch holds, both ends included.
func samplesAcross(span Window, step int64) int64 {
	return (span.UntilMilliseconds-span.FromMilliseconds)/step + 1
}

// sampleLimit is how many samples one series may come back as, given the stretch read and the
// series' finest step.
type sampleLimit func(span Window, step int64) int

// atFinestStep asks for every sample the stretch holds, so nothing is consolidated.
func atFinestStep(span Window, step int64) int {
	return int(samplesAcross(span, step))
}

// consolidatedTo asks the reader to consolidate each series to at most budget samples.
func consolidatedTo(budget int) sampleLimit {
	return func(Window, int64) int { return budget }
}

// frameSource reads the planned series of one analysis into frames.
type frameSource struct {
	reader     Reader
	analysisID string
}

// read reads every planned series over readSpanOf the window, each limited to the samples limit
// allows it.
func (source frameSource) read(callerContext context.Context, needs []need, window Window, lookback int64, limit sampleLimit) (frames, []string, error) {
	loaded := make(frames, len(needs))

	var warnings []string

	for _, planned := range needs {
		if err := callerContext.Err(); err != nil {
			return nil, nil, fmt.Errorf("read series for insights: %w", err)
		}

		step := stepOf(planned.series)
		span := readSpanOf(window, lookback, step)

		samples, err := source.reader.Read(callerContext, domain.ReadRequest{
			AnalysisID:        source.analysisID,
			SeriesID:          planned.series.ID,
			Function:          planned.function,
			FromMilliseconds:  span.FromMilliseconds,
			UntilMilliseconds: span.UntilMilliseconds,
			MaximumSamples:    limit(span, step),
		})
		if err != nil {
			return nil, nil, fmt.Errorf("read %s (%s) for insights: %w", planned.series.ID, planned.function, err)
		}

		if samples.StepMilliseconds <= 0 {
			warnings = append(warnings, fmt.Sprintf("%s returned no usable step and was left out", planned.series.File))

			continue
		}

		if len(samples.Values) == 0 {
			continue
		}

		loaded[frameKey{seriesID: planned.series.ID, function: planned.function}] = Frame{Series: planned.series, Samples: samples}
	}

	return loaded, warnings, nil
}
