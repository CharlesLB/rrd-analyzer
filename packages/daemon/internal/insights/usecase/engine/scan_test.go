package engine_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/insightstest"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/engine"
)

const detectorsDocument = `
[[rule]]
id = "rising"
severity = "info"
title = "Rising"
cause = "{cpu.user.peak}"
[[rule.condition]]
type = "cpu.user"
when = "rising"

[[rule]]
id = "falling"
severity = "info"
title = "Falling"
cause = "{heap.objects.peak}"
[[rule.condition]]
type = "heap.objects"
when = "falling"

[[rule]]
id = "shift"
severity = "info"
title = "Shift"
cause = "{load.avg.peak}"
[[rule.condition]]
type = "load.avg"
when = "change_point"

[[rule]]
id = "spike"
severity = "info"
title = "Spike"
cause = "{disk.read.peak}"
[[rule.condition]]
type = "disk.read"
when = "spike"

[[rule]]
id = "drift"
severity = "info"
title = "Drift"
cause = "{http.requests.peak}"
[[rule.condition]]
type = "http.requests"
when = "drift"

[[rule]]
id = "floor"
severity = "info"
title = "Floor"
cause = "{http.latency.peak}"
[[rule.condition]]
type = "http.latency"
when = "< 5"

[[rule]]
id = "flat"
severity = "info"
title = "Flat"
cause = "{memory.free.base}"
[[rule.condition]]
type = "memory.free"
when = "flat"
min_duration = "30m"
`

func TestScan_EveryDetector_FiresThroughTheEngineWithItsDirection(t *testing.T) {
	output := scan(t, scenario{document: detectorsDocument, series: []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", insightstest.RampAfter(60, 29, 1)),
		series("heap", "heap.rrd", "value", "", insightstest.RampAfter(60, 29, -1)),
		series("load", "load.rrd", "value", "", withValue(constant(60, 0), 30, 30, 10)),
		series("disk", "disk.rrd", "value", "", withValue(constant(60, 1), 40, 1, 50)),
		series("requests", "requests.rrd", "value", "", withValue(constant(60, 10), 30, 30, 20)),
		series("latency", "latency.rrd", "value", "ms", withValue(constant(60, 100), 20, 3, 1)),
		series("free", "memory.rrd", "free", "B", constant(60, 7)),
	}})

	want := map[string]domain.Direction{
		"rising": domain.DirectionRising, "falling": domain.DirectionFalling, "shift": domain.DirectionRising,
		"spike": domain.DirectionRising, "drift": domain.DirectionTrend, "floor": domain.DirectionFalling,
		"flat": domain.DirectionFlat,
	}

	seen := map[string]bool{}

	for _, finding := range output.Findings {
		seen[finding.RuleID] = true

		if direction := finding.Evidence[0].Direction; direction != want[finding.RuleID] {
			t.Errorf("%s direction = %s, want %s", finding.RuleID, direction, want[finding.RuleID])
		}
	}

	for ruleID := range want {
		if !seen[ruleID] {
			t.Errorf("rule %s produced no finding; findings: %+v", ruleID, output.Findings)
		}
	}
}

func TestScan_UnknownDetector_ProducesNothing(t *testing.T) {
	rule := domain.Rule{
		ID: "bogus", Severity: domain.SeverityInfo, Title: "Bogus", Interval: domain.IntervalEpisodes, Anchor: "cpu.user",
		Conditions: []domain.Condition{{Alias: "cpu.user", Type: "cpu.user", When: domain.When{Detector: "bogus"}, Function: domain.FunctionAverage}},
		Evidence:   []string{"cpu.user"},
	}

	cpu := series("cpu", "cpu.rrd", "value", "%", constant(10, 1))
	input := engine.Input{
		AnalysisID: analysisID, Scope: domain.ScopeAll, Rules: []domain.Rule{rule},
		Window:         engine.Window{FromMilliseconds: origin, UntilMilliseconds: at(9)},
		Classification: classify.Classify(testClassifier, []domain.SeriesInfo{cpu.info}),
	}

	output, err := engine.Scan(context.Background(), &fakeReader{series: []fakeSeries{cpu}}, input)
	if err != nil || len(output.Findings) != 0 || output.Findings == nil || output.Warnings == nil {
		t.Errorf("Scan = %+v, %v; want empty, non-nil findings and warnings", output, err)
	}
}

const twoPassDocument = `
[[rule]]
id = "outage"
severity = "critical"
title = "Outage"
cause = "Silent for {gap.duration}."

[rule.trigger]
as = "gap"
type = "cpu.user"
when = "gap"

[[rule]]
id = "busy"
severity = "warning"
title = "Busy"
cause = "Requests above 50."

[[rule.condition]]
type = "http.requests"
when = "> 50"

[[rule]]
id = "slow-drift"
severity = "info"
title = "Drift"
interval = "window"
cause = "Load from {load.avg.base} to {load.avg.peak}."

[[rule.condition]]
type = "load.avg"
when = "drift"

[[rule]]
id = "read-spike"
severity = "warning"
title = "Spike"
cause = "Reads spiked to {disk.read.peak}."

[[rule.condition]]
type = "disk.read"
when = "spike"
level = 500
`

const (
	twoPassRows   = 2000
	twoPassBudget = 500
	coarseStep    = 4 * minute

	// coarseReadsOfWideWithShort is pass one reading the CPU and the load series, after which the
	// next read is the load surge measured again at the finest step.
	coarseReadsOfWideWithShort = 2
)

func twoPassSeries() []fakeSeries {
	return []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", withHoles(withHoles(constant(twoPassRows, 1), 1000, 40), 1050, 40)),
		series("requests", "requests.rrd", "value", "", constant(twoPassRows, 100)),
		series("load", "load.rrd", "value", "", withValue(constant(twoPassRows, 10), 1000, 1000, 20)),
		series("disk", "disk.rrd", "value", "", withValue(constant(twoPassRows, 0), 1020, 1, 1000)),
	}
}

func TestScan_AllDataOverTheBudget_RefinesSmallCandidatesAndKeepsWideOnesCoarse(t *testing.T) {
	reader := &fakeReader{}

	output, err := scanWith(context.Background(), t, scenario{document: twoPassDocument, series: twoPassSeries(), fineSampleBudget: twoPassBudget}, reader)
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}

	want := []struct {
		ruleID string
		from   int64
		until  int64
		step   int64
	}{
		{ruleID: "outage", from: at(1000), until: at(1040), step: minute},
		{ruleID: "outage", from: at(1050), until: at(1090), step: minute},
		{ruleID: "busy", from: at(0), until: at(1996), step: coarseStep},
		{ruleID: "slow-drift", from: at(0), until: at(twoPassRows - 1), step: coarseStep},
	}

	if len(output.Findings) != len(want) {
		t.Fatalf("findings = %+v, want %d", output.Findings, len(want))
	}

	for index, expected := range want {
		finding := output.Findings[index]
		if finding.RuleID != expected.ruleID || finding.FromMilliseconds != expected.from || finding.UntilMilliseconds != expected.until ||
			finding.Evidence[0].StepMilliseconds != expected.step {
			t.Errorf("finding %d = %s %d..%d at step %d, want %s %d..%d at step %d", index, finding.RuleID, finding.FromMilliseconds, finding.UntilMilliseconds,
				finding.Evidence[0].StepMilliseconds, expected.ruleID, expected.from, expected.until, expected.step)
		}
	}

	if got := causeText(output.Findings[0]); got != "Silent for 40 min." {
		t.Errorf("refined cause = %q", got)
	}

	coarseReads := 0

	var fineReads []string

	for _, request := range reader.requests {
		if request.MaximumSamples == twoPassBudget {
			coarseReads++

			continue
		}

		fineReads = append(fineReads, request.SeriesID)
	}

	// The outage regions are the only ones refined, and outage reads cpu alone: the other three
	// series are read coarsely once and never again.
	if coarseReads != 4 || len(fineReads) != 1 || fineReads[0] != "cpu" {
		t.Errorf("reads = %d coarse and fine %v, want 4 coarse and cpu alone at the fine step", coarseReads, fineReads)
	}
}

// A viewport zoomed out to months is read the way an all-data run is: a single read at the finest
// step would hold every minute of every series, however far past the budget.
func TestScan_ViewportOverTheBudget_ReadsInTwoPassesAndNeverPastTheBudget(t *testing.T) {
	reader := &fakeReader{}

	_, err := scanWith(context.Background(), t, scenario{
		document: twoPassDocument, series: twoPassSeries(), fineSampleBudget: twoPassBudget, scope: domain.ScopeViewport,
	}, reader)
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}

	coarseReads := 0
	for _, request := range reader.requests {
		if request.MaximumSamples > twoPassBudget {
			t.Errorf("read of %s asks for %d samples, past the budget of %d", request.SeriesID, request.MaximumSamples, twoPassBudget)
		}

		if request.MaximumSamples == twoPassBudget {
			coarseReads++
		}
	}

	if coarseReads != 4 {
		t.Errorf("coarse reads = %d, want one per planned series", coarseReads)
	}
}

func TestScan_RepeatsOverTheBudget_AreCountedInTheRegionPassOnePointsAt(t *testing.T) {
	uptime := series("uptime", "uptime.rrd", "value", "", uptimeRestartingAt(twoPassRows, 1000, 1010, 1020, 1500))

	output := scan(t, scenario{document: burstDocument, series: []fakeSeries{uptime}, fineSampleBudget: twoPassBudget})

	if len(output.Findings) != 1 {
		t.Fatalf("findings = %+v, want only the burst: pass one cannot count it, and the lone restart at 1500 is no burst", output.Findings)
	}

	finding := output.Findings[0]
	if finding.FromMilliseconds != at(999) || finding.UntilMilliseconds != at(1020) || finding.Evidence[0].StepMilliseconds != minute {
		t.Errorf("finding = %d..%d at step %d, want %d..%d at the fine step", finding.FromMilliseconds, finding.UntilMilliseconds,
			finding.Evidence[0].StepMilliseconds, at(999), at(1020))
	}

	if got := causeText(finding); got != "Restarted 3 times in 21 min." {
		t.Errorf("cause = %q", got)
	}
}

const wideWithShortDocument = `
[[rule]]
id = "busy-surge"
severity = "warning"
title = "Busy"
cause = "CPU busy for {cpu.user.duration} while load peaked at {load.avg.peak}."

[[rule.condition]]
type = "cpu.user"
when = "> 50"

[[rule.condition]]
type = "load.avg"
when = "excursion"
overlaps = "cpu.user"
`

// alternatingLoad never settles on one reading, so a stretch of it is no surge and a minute of it is
// no average of a coarse bucket.
func alternatingLoad() []float64 {
	load := make([]float64, twoPassRows)
	for index := range load {
		load[index] = float64(1 + index%2)
	}

	return load
}

// wideWithShortSeries is CPU busy over the whole window, too wide a finding to refine, and a load
// surge of two minutes inside it.
func wideWithShortSeries() []fakeSeries {
	return []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", constant(twoPassRows, 100)),
		series("load", "load.rrd", "value", "", withValue(alternatingLoad(), 1501, 2, 100)),
	}
}

func TestScan_FindingTooWideToRefine_MeasuresItsShortEpisodesAgainAtTheFinestStep(t *testing.T) {
	output := scan(t, scenario{document: wideWithShortDocument, series: wideWithShortSeries(), fineSampleBudget: twoPassBudget})

	if len(output.Findings) != 1 {
		t.Fatalf("findings = %+v, want one", output.Findings)
	}

	finding := output.Findings[0]
	if got := causeText(finding); !strings.HasSuffix(got, "while load peaked at 100.") {
		t.Errorf("cause = %q, want the peak the minutes hold rather than its four-minute average", got)
	}

	if finding.Evidence[0].StepMilliseconds != coarseStep || finding.Evidence[1].StepMilliseconds != minute {
		t.Errorf("steps = %d and %d, want the wide CPU stretch coarse and the load surge fine", finding.Evidence[0].StepMilliseconds, finding.Evidence[1].StepMilliseconds)
	}
}

const spacedRestartsDocument = `
[[rule]]
id = "recurring"
severity = "warning"
title = "Recurring"
cause = "Restarted {restarts.count} times in {restarts.duration}."

[[rule.condition]]
as = "restarts"
type = "system.up"
when = "reset"
repeats = 3
repeats_within = "12h"
`

func TestScan_RepeatsSpreadWiderThanTheCoarseStepCanTell_AreCountedInPassOneAndKept(t *testing.T) {
	uptime := series("uptime", "uptime.rrd", "value", "", uptimeRestartingAt(twoPassRows, 200, 350, 500))

	output := scan(t, scenario{document: spacedRestartsDocument, series: []fakeSeries{uptime}, fineSampleBudget: twoPassBudget})

	if len(output.Findings) != 1 || output.Findings[0].Evidence[0].StepMilliseconds != coarseStep {
		t.Fatalf("findings = %+v, want the three restarts counted at the coarse step and kept there, though their region would fit", output.Findings)
	}

	if got := causeText(output.Findings[0]); !strings.HasPrefix(got, "Restarted 3 times in ") {
		t.Errorf("cause = %q", got)
	}
}

func TestScan_MergedRegionOverTheBudget_KeepsTheCoarseFindings(t *testing.T) {
	values := constant(twoPassRows, 1)
	for start := 100; start < 1600; start += 50 {
		values = withHoles(values, start, 40)
	}

	output := scan(t, scenario{document: gapsDocument, series: []fakeSeries{series("cpu", "cpu.rrd", "value", "%", values)}, fineSampleBudget: twoPassBudget})

	if len(output.Findings) == 0 {
		t.Fatal("no findings, want the coarse gaps")
	}

	for _, finding := range output.Findings {
		if finding.Evidence[0].StepMilliseconds != coarseStep {
			t.Errorf("finding %s at step %d, want the coarse step", finding.ID, finding.Evidence[0].StepMilliseconds)
		}
	}
}

func TestScan_ReadFailures_StopTheScan(t *testing.T) {
	cpu := []fakeSeries{series("cpu", "cpu.rrd", "value", "%", withHoles(constant(twoPassRows, 1), 1000, 40))}

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	cancelling, cancelOnRead := context.WithCancel(context.Background())
	defer cancelOnRead()

	tests := []struct {
		name          string
		callerContext context.Context
		test          scenario
		reader        *fakeReader
		wantErr       error
	}{
		{name: "refused read", callerContext: context.Background(), test: scenario{document: gapsDocument, series: cpu}, reader: &fakeReader{refuse: "cpu"}, wantErr: errReadRefused},
		{name: "cancelled before reading", callerContext: cancelled, test: scenario{document: gapsDocument, series: cpu}, reader: &fakeReader{}, wantErr: context.Canceled},
		{name: "cancelled between reads", callerContext: cancelling, test: scenario{document: twoPassDocument, series: twoPassSeries()}, reader: &fakeReader{cancel: cancelOnRead}, wantErr: context.Canceled},
		{name: "refused coarse read", callerContext: context.Background(), test: scenario{document: gapsDocument, series: cpu, fineSampleBudget: twoPassBudget}, reader: &fakeReader{refuse: "cpu"}, wantErr: errReadRefused},
		{name: "refused fine read", callerContext: context.Background(), test: scenario{document: gapsDocument, series: cpu, fineSampleBudget: twoPassBudget}, reader: &fakeReader{refuseAfter: 1}, wantErr: errReadRefused},
		{name: "refused remeasuring read", callerContext: context.Background(), test: scenario{document: wideWithShortDocument, series: wideWithShortSeries(), fineSampleBudget: twoPassBudget}, reader: &fakeReader{refuseAfter: coarseReadsOfWideWithShort}, wantErr: errReadRefused},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := scanWith(tt.callerContext, t, tt.test, tt.reader); !errors.Is(err, tt.wantErr) {
				t.Errorf("Scan error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestScan_ReadWithoutAStep_IsLeftOutWithAWarning(t *testing.T) {
	cpu := []fakeSeries{series("cpu", "cpu.rrd", "value", "%", withHoles(constant(100, 1), 50, 10))}

	output, err := scanWith(context.Background(), t, scenario{document: gapsDocument, series: cpu}, &fakeReader{zeroStep: "cpu"})
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}

	if len(output.Findings) != 0 || len(output.Warnings) != 1 || !strings.Contains(output.Warnings[0], "cpu.rrd") {
		t.Errorf("Scan = %+v, want no finding and a warning naming cpu.rrd", output)
	}
}

const surgeDocument = `
[[rule]]
id = "surge"
severity = "warning"
title = "Surge"
cause = "{load.avg.peak}"
[[rule.condition]]
type = "load.avg"
when = "excursion"
peak_over_median = 3
`

// A surge found in pass one is refined in a region around it, and the median it is measured against
// is taken over that region. A region only a few coarse buckets wider than the surge would be
// mostly surge, its median would climb with it, and the refined read would drop what pass one
// found.
func TestScan_SurgeLongerThanAFewCoarseSteps_IsStillFoundInTwoPasses(t *testing.T) {
	const rows = 2000

	for _, surgeRows := range []int{5, 15, 30, 60} {
		load := series("load", "load.rrd", "value", "", withValue(constant(rows, 10), 1000, surgeRows, 100))

		output := scan(t, scenario{document: surgeDocument, series: []fakeSeries{load}, fineSampleBudget: 500})

		if len(output.Findings) != 1 || output.Findings[0].FromMilliseconds > at(1000) || output.Findings[0].UntilMilliseconds < at(1000+surgeRows-1) {
			t.Errorf("a surge of %d min gave %+v, want one finding over it", surgeRows, output.Findings)
		}
	}
}

const collapseDocument = `
[[rule]]
id = "collapse"
severity = "warning"
title = "Collapse"
cause = "{heap.objects.peak}"
[[rule.condition]]
type = "heap.objects"
when = "< 20%"
percent_of = "median"
`

func TestScan_CollapseAgainstTheMedianLongerThanAFewCoarseSteps_IsStillFoundInTwoPasses(t *testing.T) {
	heap := series("heap", "heap.rrd", "value", "", withValue(constant(2000, 100), 1000, 60, 5))

	output := scan(t, scenario{document: collapseDocument, series: []fakeSeries{heap}, fineSampleBudget: 500})

	if len(output.Findings) != 1 || output.Findings[0].FromMilliseconds > at(1000) || output.Findings[0].UntilMilliseconds < at(1059) {
		t.Errorf("findings = %+v, want one over the hour at 5%% of the median", output.Findings)
	}
}

const loadBesideBusyCPUDocument = `
[[rule]]
id = "busy-load"
severity = "warning"
title = "Busy"
cause = "CPU busy while load peaked at {load.avg.peak}."

[[rule.condition]]
type = "cpu.user"
when = "> 50"

[[rule.condition]]
type = "load.avg"
when = "> 50"
overlaps = "cpu.user"
`

func TestScan_CoarseEpisodeMeasuredAgainBesideAnotherOne_TakesTheFineEpisodeItOverlaps(t *testing.T) {
	load := withValue(withValue(alternatingLoad(), 1501, 2, 100), 1509, 2, 200)

	output := scan(t, scenario{
		document:         loadBesideBusyCPUDocument,
		series:           []fakeSeries{series("cpu", "cpu.rrd", "value", "%", constant(twoPassRows, 100)), series("load", "load.rrd", "value", "", load)},
		fineSampleBudget: twoPassBudget,
	})

	if len(output.Findings) != 1 {
		t.Fatalf("findings = %+v, want one", output.Findings)
	}

	finding := output.Findings[0]
	if got := causeText(finding); !strings.HasSuffix(got, "load peaked at 200.") || finding.Evidence[1].StepMilliseconds != minute {
		t.Errorf("cause = %q at step %d, want the 200 surge pass one joined, measured at the minute, not the 100 beside it", got, finding.Evidence[1].StepMilliseconds)
	}
}

func TestScan_FineRepeatsInARegionTooWideToReadFinely_AreLeftOutRatherThanCountedCoarsely(t *testing.T) {
	const (
		firstRestart    = 1000
		lastRestart     = 1600
		restartInterval = 10
	)

	var restarts []int
	for restart := firstRestart; restart <= lastRestart; restart += restartInterval {
		restarts = append(restarts, restart)
	}

	uptime := series("uptime", "uptime.rrd", "value", "", uptimeRestartingAt(twoPassRows, restarts...))

	output := scan(t, scenario{document: burstDocument, series: []fakeSeries{uptime}, fineSampleBudget: twoPassBudget, episodeCap: len(restarts)})

	if len(output.Findings) != 0 {
		t.Errorf("findings = %+v, want none: only a fine read can count three restarts within thirty minutes, and their region is past the budget", output.Findings)
	}
}
