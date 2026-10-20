// Package engine turns classified series and a ruleset into ranked findings: it plans the reads,
// detects episodes, joins them causally around each anchor, and assembles what the front shows.
package engine

import (
	"cmp"
	"context"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const (
	DefaultEpisodeCap = 32

	// DefaultFineSampleBudget is how many samples a series may have at its finest step over what a
	// scan reads, the window with its lookback and margins, before it switches to two passes. Seven
	// weeks at five minutes, with the ten days the default rules look back before them, fits.
	DefaultFineSampleBudget = 20000
)

// Scan runs the rules over the window. A viewport, or an all-data window whose every series fits
// the fine budget, is read once at the finest step. Otherwise pass one reads each series
// consolidated to the budget to find candidates, and pass two re-reads only the regions around
// them at the finest step and evaluates there. A rule whose interval is the window keeps its
// pass-one finding: a statistic over the whole window is what it reports, and the regions are not
// the whole window.
//
// A condition whose repeats fall closer together than the coarse step can tell apart is looked for
// as a single episode in pass one. Three restarts in twenty minutes average into one coarse bucket,
// so pass one cannot count them; it can only say where to look, and a candidate it cannot send to a
// region is dropped rather than reported with a count nobody verified. Repeats spread wide enough
// for pass one to count keep its count, like a window rule keeps its statistic: a region could only
// recount part of them, and a burst spanning weeks sent to one would merge every small region
// around it into one too large to refine.
//
// A finding too wide to refine whole keeps what pass one found, and each of its short episodes is
// measured again at the finest step around itself: a stuck CPU reading lasting weeks cannot be read
// at the minute, but the ten-minute load surge beside it can.
func Scan(callerContext context.Context, reader Reader, input Input) (Output, error) {
	input.EpisodeCap = cmp.Or(input.EpisodeCap, DefaultEpisodeCap)
	input.FineSampleBudget = cmp.Or(input.FineSampleBudget, DefaultFineSampleBudget)

	source := frameSource{reader: reader, analysisID: input.AnalysisID}
	ruleset := compile(input.Rules)
	needs := plan(input.Classification, ruleset)
	lookback := longestLookback(ruleset)

	if fitsBudget(needs, input.Window, lookback, input.FineSampleBudget) {
		loaded, warnings, err := source.read(callerContext, needs, input.Window, lookback, atFinestStep)
		if err != nil {
			return Output{}, err
		}

		candidates, evaluated := evaluate(input, ruleset, loaded, input.Window)

		return finish(candidates, append(warnings, evaluated...)), nil
	}

	return scanInTwoPasses(callerContext, source, input, ruleset, needs, lookback)
}

// scanInTwoPasses reads every planned series coarsely over the window, then refines around what
// that found.
func scanInTwoPasses(callerContext context.Context, source frameSource, input Input, ruleset []compiledRule, needs []need, lookback int64) (Output, error) {
	coarseFrames, warnings, err := source.read(callerContext, needs, input.Window, lookback, consolidatedTo(input.FineSampleBudget))
	if err != nil {
		return Output{}, err
	}

	scan := twoPassScan{
		source: source, input: input, ruleset: ruleset,
		needsByRule: planEachRule(input.Classification, ruleset), coarseStep: widestStep(coarseFrames),
	}

	coarse, evaluated := evaluate(input, withoutFineRepeats(ruleset, scan.coarseStep), coarseFrames, input.Window)
	warnings = append(warnings, evaluated...)

	routes := scan.route(coarse)
	keptCoarse := routes.keptCoarse

	var kept []candidate

	for _, region := range mergeRegions(routes.regions) {
		refined, err := scan.refine(callerContext, candidatesIn(routes.routed, region), region)
		if err != nil {
			return Output{}, err
		}

		kept = append(kept, refined.kept...)
		warnings = append(warnings, refined.warnings...)

		for _, found := range refined.unrefined {
			keptCoarse = scan.appendVerified(keptCoarse, found)
		}
	}

	for _, found := range keptCoarse {
		remeasured, err := scan.remeasure(callerContext, found)
		if err != nil {
			return Output{}, err
		}

		kept = append(kept, remeasured)
	}

	return finish(kept, warnings), nil
}

// twoPassScan is what every decision after pass one is made against: the reads, the rules, and the
// coarse step pass one read at, which says which repeats it could count and how wide a region has
// to be to hold what it smeared.
type twoPassScan struct {
	source     frameSource
	input      Input
	ruleset    []compiledRule
	coarseStep int64

	// needsByRule is what each rule reads on its own, in ruleset order. A rule that anchors on
	// many episodes is asked for its region once for each, and planning it walks the whole
	// classification.
	needsByRule [][]need
}

// routes is what pass one decided for each candidate: refine it in a region at the finest step, or
// keep it as the coarse read found it.
type routes struct {
	routed     []candidate
	regions    []Window
	keptCoarse []candidate
}

// route sends every pass-one candidate it can to a region around itself, wide enough on each side
// for the region to be mostly what surrounds the candidate. A region reaches back only
// as far as its own rule looks: the frames read around it already extend by the longest lookback,
// and one rule looking back days would otherwise widen every region until they merge into one too
// large to refine. It also reaches as far as the rule's repeats may spread on either side, so the
// burst pass one pointed at fits inside it.
func (scan twoPassScan) route(coarse []candidate) routes {
	var decided routes

	for _, found := range coarse {
		rule := scan.ruleset[found.ruleIndex]
		region, fits := scan.regionAround(found, rule, scan.needsByRule[found.ruleIndex])

		if found.rule.Interval == domain.IntervalWindow || countsCoarseRepeats(rule, scan.coarseStep) || !fits {
			decided.keptCoarse = scan.appendVerified(decided.keptCoarse, found)

			continue
		}

		decided.routed = append(decided.routed, found)
		decided.regions = append(decided.regions, region)
	}

	return decided
}

// regionAround is the region a candidate is refined in, and whether it fits the fine budget. A rule
// measured against a statistic over the region is widened by the candidate's own width when that
// fits, so the statistic describes what surrounds the candidate; otherwise, and for every other
// rule, the region keeps the few coarse buckets around it.
func (scan twoPassScan) regionAround(found candidate, rule compiledRule, needs []need) (Window, bool) {
	repeats := longestFineRepeatsWithin(rule, scan.coarseStep)
	buckets := regionCoarseSteps * scan.coarseStep

	spreads := []int64{buckets}
	if measuresAgainstTheRegion(rule) {
		width := found.finding.UntilMilliseconds - found.finding.FromMilliseconds
		spreads = []int64{max(buckets, regionSurroundingWidths*width), buckets}
	}

	var region Window

	for _, spread := range spreads {
		margin := repeats + spread
		region = scan.input.Window.around(found.finding.FromMilliseconds, found.finding.UntilMilliseconds, rule.lookback+margin, margin)

		if fitsBudget(needs, region, rule.lookback, scan.input.FineSampleBudget) {
			return region, true
		}
	}

	return region, false
}

// measuresAgainstTheRegion says whether a condition of the rule compares its series with the median
// of the stretch it searches: an excursion, or a percentage of the series' own median.
func measuresAgainstTheRegion(rule compiledRule) bool {
	for _, condition := range rule.ordered {
		if condition.When.Detector == domain.DetectorExcursion || (condition.When.Percent && condition.PercentOf.Kind == domain.PercentMedian) {
			return true
		}
	}

	return false
}

// refinement is what re-reading one region found: the findings it keeps, the candidates it was too
// large to read finely, and what the reads and the evaluation warned about.
type refinement struct {
	kept      []candidate
	unrefined []candidate
	warnings  []string
}

// refine reads and evaluates only the rules whose candidates the region was built around: another
// rule's finding in the same stretch is either already kept coarse or not a finding at all.
func (scan twoPassScan) refine(callerContext context.Context, inRegion []candidate, region Window) (refinement, error) {
	ruleIndexes := ruleIndexesOf(inRegion)
	regionRules := rulesAt(scan.ruleset, ruleIndexes)
	regionNeeds := plan(scan.input.Classification, regionRules)
	regionLookback := longestLookback(regionRules)

	if !fitsBudget(regionNeeds, region, regionLookback, scan.input.FineSampleBudget) {
		return refinement{unrefined: inRegion}, nil
	}

	fineFrames, readWarnings, err := scan.source.read(callerContext, regionNeeds, region, regionLookback, atFinestStep)
	if err != nil {
		return refinement{}, err
	}

	refined, evaluated := evaluateRules(scan.input, scan.ruleset, fineFrames, region, ruleIndexes)
	outcome := refinement{warnings: append(readWarnings, evaluated...)}

	for _, found := range refined {
		if found.rule.Interval != domain.IntervalWindow {
			outcome.kept = append(outcome.kept, found)
		}
	}

	return outcome, nil
}

// appendVerified keeps a pass-one candidate as it stands unless its rule counts repeats that only a
// fine read can verify.
func (scan twoPassScan) appendVerified(kept []candidate, found candidate) []candidate {
	if countsFineRepeats(scan.ruleset[found.ruleIndex], scan.coarseStep) {
		return kept
	}

	return append(kept, found)
}
