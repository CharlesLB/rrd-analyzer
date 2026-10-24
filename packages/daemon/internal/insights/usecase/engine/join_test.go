package engine_test

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/engine"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/render"
)

const oomDocument = `
[[rule]]
id = "oom"
severity = "critical"
title = "Down"
match = "order"
evidence = ["heap", "memory", "outage", "latency"]
onset = ["heap.onset", "memory.onset", "outage.onset - 3h"]
end = ["outage.end"]
cause = "Climbed {finding→outage.lag}; heap {heap.peak}; memory {memory.base} to {memory.peak} mean {memory.mean} from {memory.onset}; silent {outage.duration}; heap lag {heap→outage.lag}; window {window.duration}; span {finding.duration}; heap end {heap.end}; heap span {heap.duration}."

[rule.trigger]
as = "outage"
type = "memory.used"
when = "gap"

[[rule.condition]]
as = "heap"
type = "heap.objects"
when = "excursion"
lookback = "1h"
optional = true

[[rule.condition]]
as = "memory"
type = "memory.used"
when = "excursion"
lookback = "1h"
optional = true

[[rule.condition]]
as = "latency"
type = "http.latency"
when = "gap"
overlaps = "outage"
optional = true
`

const chainDocument = `
[[rule]]
id = "chain"
severity = "warning"
title = "Chain"
cause = "Load followed cpu by {cpu.user→load.avg.lag}, peaking at {load.avg.peak}."

[[rule.condition]]
type = "cpu.user"
when = "> 50"

[[rule.condition]]
type = "load.avg"
when = "> 5"
after = "cpu.user"
within = "10m"
`

func TestScan_TriggerWithLookbackAndOverlap_AssemblesOneInferredFinding(t *testing.T) {
	memory := withHoles(withBump(constant(200, 100), 80, 10, 100), 100, 20)

	output := scan(t, scenario{document: oomDocument, series: []fakeSeries{
		series("memory", "memory.rrd", "used", "B", memory),
		series("latency", "latency.rrd", "value", "ms", withHoles(constant(200, 5), 100, 20)),
	}})

	if len(output.Findings) != 1 || len(output.Warnings) != 0 {
		t.Fatalf("Scan = %+v, want one finding and no warnings", output)
	}

	finding := output.Findings[0]
	if finding.ID != "fd0" || finding.RuleID != "oom" || finding.Severity != domain.SeverityCritical || finding.Title != "Down" || finding.Match != "order" {
		t.Errorf("header = %+v", finding)
	}

	if !finding.Inferred || finding.Confidence != domain.ConfidenceMedium {
		t.Errorf("inferred %v confidence %s, want an inferred finding capped at medium by the missing heap", finding.Inferred, finding.Confidence)
	}

	if finding.FromMilliseconds != at(73) || finding.UntilMilliseconds != at(120) {
		t.Errorf("interval = %d..%d, want the memory onset to the end of the gap", finding.FromMilliseconds, finding.UntilMilliseconds)
	}

	onsetText := time.UnixMilli(at(73)).UTC().Format("2006-01-02 15:04 UTC")
	want := "Climbed 27 min; heap n/a; memory 130.0 B to 200.0 B mean 162.7 B from " + onsetText +
		"; silent 20 min; heap lag n/a; window 3.3 h; span 47 min; heap end n/a; heap span n/a."

	if got := causeText(finding); got != want {
		t.Errorf("cause =\n  %s\nwant\n  %s", got, want)
	}

	instants := 0

	for _, part := range finding.Cause {
		if part.InstantMilliseconds != nil {
			instants++

			if *part.InstantMilliseconds != at(73) || !part.Emphasis {
				t.Errorf("instant part = %+v, want the memory onset emphasised", part)
			}
		}
	}

	if instants != 1 {
		t.Errorf("instant parts = %d, want 1", instants)
	}

	assertOOMEvidence(t, finding.Evidence)
}

func assertOOMEvidence(t *testing.T, evidence []domain.Evidence) {
	t.Helper()

	if len(evidence) != 3 {
		t.Fatalf("evidence = %+v, want memory rise, outage gap and latency gap", evidence)
	}

	rise, outage, latency := evidence[0], evidence[1], evidence[2]

	if rise.Type != "memory.used" || rise.Semantic != "memory" || rise.Direction != domain.DirectionRising || rise.Unit != "B" ||
		rise.FromMilliseconds != at(73) || rise.UntilMilliseconds != at(87) || rise.ChangePointMilliseconds != at(73) ||
		rise.StepMilliseconds != minute || rise.ConsolidationFunction != domain.FunctionAverage || len(rise.Spark) != 26 {
		t.Errorf("memory rise = %+v", rise)
	}

	if rise.FromValue == nil || math.Abs(*rise.FromValue-130) > 1e-9 || rise.ToValue == nil || *rise.ToValue != 200 {
		t.Errorf("memory rise values = %v → %v, want 130 → 200", rise.FromValue, rise.ToValue)
	}

	if outage.Direction != domain.DirectionGap || outage.FromMilliseconds != at(100) || outage.UntilMilliseconds != at(119) || outage.FromValue != nil || outage.ToValue != nil {
		t.Errorf("outage = %+v, want a gap from 100 to 119 without values", outage)
	}

	if latency.SeriesID != "latency" || latency.Direction != domain.DirectionGap || latency.Source != "latency.rrd" {
		t.Errorf("latency = %+v, want the overlapping latency gap", latency)
	}
}

func TestScan_AfterWithin_TakesTheEarliestOnsetInsideTheAllowance(t *testing.T) {
	cpu := withValue(withValue(constant(100, 0), 20, 6, 100), 60, 6, 100)
	load := withValue(withValue(withValue(constant(100, 0), 10, 3, 10), 23, 2, 10), 90, 2, 10)

	output := scan(t, scenario{document: chainDocument, series: []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", cpu),
		series("load", "load.rrd", "value", "", load),
	}})

	if len(output.Findings) != 1 {
		t.Fatalf("findings = %+v, want only the anchor whose load followed within ten minutes", output.Findings)
	}

	finding := output.Findings[0]
	if finding.FromMilliseconds != at(20) || finding.UntilMilliseconds != at(25) || finding.Inferred || finding.Confidence != domain.ConfidenceHigh {
		t.Errorf("finding = %+v, want 20..25, observed, high confidence", finding)
	}

	if got := causeText(finding); got != "Load followed cpu by 3 min, peaking at 10.00." {
		t.Errorf("cause = %q", got)
	}

	if len(finding.Evidence) != 2 || finding.Evidence[1].FromMilliseconds != at(23) || finding.Evidence[0].Semantic != "cpu" {
		t.Errorf("evidence = %+v, want cpu then the load run at 23", finding.Evidence)
	}
}

func TestScan_WithinShorterThanTheStep_MatchesAsUnverifiableAtMediumConfidence(t *testing.T) {
	const fiveMinutes = 5 * minute

	cpu := series("cpu", "cpu.rrd", "value", "%", withValue(constant(100, 0), 20, 6, 100)).withStep(fiveMinutes)
	load := series("load", "load.rrd", "value", "", withValue(constant(100, 0), 21, 2, 10)).withStep(fiveMinutes)
	document := strings.Replace(chainDocument, `within = "10m"`, `within = "4m"`, 1)

	output := scan(t, scenario{document: document, series: []fakeSeries{cpu, load}, window: engine.Window{FromMilliseconds: origin, UntilMilliseconds: origin + 99*fiveMinutes}})

	if len(output.Findings) != 1 || output.Findings[0].Confidence != domain.ConfidenceMedium {
		t.Fatalf("findings = %+v, want one unverifiable match at medium confidence", output.Findings)
	}

	if got := causeText(output.Findings[0]); got != "Load followed cpu by 5 min, peaking at 10.00." {
		t.Errorf("cause = %q", got)
	}
}

func TestScan_WithinShorterThanTheArchiveBehindAFinerGrid_MatchesAsUnverifiableAtMediumConfidence(t *testing.T) {
	const fiveMinutes = 5 * minute

	cpu := series("cpu", "cpu.rrd", "value", "%", withValue(constant(100, 0), 20, 6, 100)).withArchiveStep(fiveMinutes)
	load := series("load", "load.rrd", "value", "", withValue(constant(100, 0), 22, 2, 10)).withArchiveStep(fiveMinutes)
	document := strings.Replace(chainDocument, `within = "10m"`, `within = "4m"`, 1)

	output := scan(t, scenario{document: document, series: []fakeSeries{cpu, load}})

	if len(output.Findings) != 1 || output.Findings[0].Confidence != domain.ConfidenceMedium {
		t.Fatalf("findings = %+v, want one unverifiable match at medium confidence", output.Findings)
	}
}

func TestScan_RequiredConditionWithoutSeries_ProducesNoFinding(t *testing.T) {
	output := scan(t, scenario{document: chainDocument, series: []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", withValue(constant(100, 0), 20, 6, 100)),
	}})

	if len(output.Findings) != 0 {
		t.Errorf("findings = %+v, want none without a load series", output.Findings)
	}
}

const percentDocument = `
[[rule]]
id = "memory-full"
severity = "critical"
title = "Memory full"
cause = "Memory at {memory.used.peak}."

[[rule.condition]]
type = "memory.used"
when = "> 90%"
percent_of = { sum = ["memory.used", "memory.free"] }

[[rule]]
id = "cpu-high"
severity = "warning"
title = "CPU high"
cause = "CPU at {cpu.user.peak}."

[[rule.condition]]
type = "cpu.user"
when = "> 80%"
percent_of = "ds.max"

[[rule]]
id = "load-high"
severity = "info"
title = "Load high"
cause = "Load at {load.avg.peak}."

[[rule.condition]]
type = "load.avg"
when = "> 80%"
percent_of = "self"
`

func TestScan_Percentages_ResolveTheirDenominatorOrWarnWithoutGuessing(t *testing.T) {
	output := scan(t, scenario{document: percentDocument, series: []fakeSeries{
		series("used-a", "memory-a.rrd", "used", "B", constant(50, 95)),
		series("free-a", "memory-a.rrd", "free", "B", constant(50, 5)),
		series("used-b", "memory-b.rrd", "used", "B", constant(50, 99)),
		series("free-c", "memory-c.rrd", "free", "B", constant(50, 1)),
		series("used-d", "memory-d.rrd", "used", "B", constant(50, 99)),
		series("free-d", "memory-d.rrd", "free", "B", constant(50, 1)).withStep(2 * minute),
		series("cpu-max", "cpu.rrd", "value", "", constant(50, 180)).withMaximum(200),
		series("cpu-b", "cpu-b.rrd", "value", "", constant(50, 180)),
		series("load", "load.rrd", "value", "", constant(50, 85)),
	}})

	wantCauses := []string{"Memory at 95.0%.", "CPU at 90.0%.", "Load at 85.0%."}
	if len(output.Findings) != len(wantCauses) {
		t.Fatalf("findings = %+v, want %d", output.Findings, len(wantCauses))
	}

	for index, want := range wantCauses {
		if got := causeText(output.Findings[index]); got != want || output.Findings[index].Evidence[0].Unit != "%" {
			t.Errorf("finding %d cause %q unit %q, want %q in percent", index, got, output.Findings[index].Evidence[0].Unit, want)
		}
	}

	if output.Findings[0].Evidence[0].SeriesID != "used-a" {
		t.Errorf("memory evidence = %s, want the series whose denominator resolved", output.Findings[0].Evidence[0].SeriesID)
	}

	for _, file := range []string{"memory-b.rrd", "memory-d.rrd", "cpu-b.rrd"} {
		if !containsSubstring(output.Warnings, file) {
			t.Errorf("warnings = %v, want one about %s", output.Warnings, file)
		}
	}

	if len(output.Warnings) != 3 {
		t.Errorf("warnings = %v, want exactly three", output.Warnings)
	}
}

func containsSubstring(texts []string, fragment string) bool {
	for _, text := range texts {
		if strings.Contains(text, fragment) {
			return true
		}
	}

	return false
}

const downDocument = `
[[rule]]
id = "restart"
severity = "warning"
title = "Restart"
cause = "Down near {down.onset}."

[rule.trigger]
as = "down"
type = "system.down"

[[rule]]
id = "reset-only"
severity = "info"
title = "Reset"
cause = "Reset near {down.end}."

[rule.trigger]
as = "down"
type = "system.down"
when = "reset"
`

func TestScan_SystemDown_IsAGapOnAnySeriesOrAResetOnUptimeAndAlwaysInferred(t *testing.T) {
	uptime := make([]float64, 100)
	for index := range uptime {
		uptime[index] = float64((index + 1) * 60)
		if index >= 50 {
			uptime[index] = float64((index - 49) * 60)
		}
	}

	cpu := withHoles(withValue(withValue(constant(100, 10), 30, 1, 100), 31, 1, 5), 70, 10)

	output := scan(t, scenario{document: downDocument, series: []fakeSeries{
		series("uptime", "uptime.rrd", "value", "s", uptime),
		series("cpu", "cpu.rrd", "value", "%", cpu),
	}})

	want := []struct {
		ruleID string
		from   int64
		until  int64
	}{
		{ruleID: "restart", from: at(49), until: at(50)},
		{ruleID: "restart", from: at(70), until: at(80)},
		{ruleID: "reset-only", from: at(49), until: at(50)},
	}

	if len(output.Findings) != len(want) {
		t.Fatalf("findings = %+v, want %d", output.Findings, len(want))
	}

	for index, expected := range want {
		finding := output.Findings[index]
		if finding.RuleID != expected.ruleID || finding.FromMilliseconds != expected.from || finding.UntilMilliseconds != expected.until || !finding.Inferred {
			t.Errorf("finding %d = %s %d..%d inferred=%v, want %s %d..%d inferred", index, finding.RuleID, finding.FromMilliseconds, finding.UntilMilliseconds, finding.Inferred, expected.ruleID, expected.from, expected.until)
		}
	}

	reset := output.Findings[0].Evidence[0]
	if reset.Type != "system.up" || reset.Direction != domain.DirectionReset || reset.FromValue != nil || reset.ToValue != nil {
		t.Errorf("reset evidence = %+v, want a value-less reset on system.up", reset)
	}

	if gap := output.Findings[1].Evidence[0]; gap.Type != "cpu.user" || gap.Direction != domain.DirectionGap {
		t.Errorf("gap evidence = %+v, want a gap on cpu.user", gap)
	}
}

const gapsDocument = `
[[rule]]
id = "gaps"
severity = "info"
title = "Gap"
cause = "Gap of {gap.duration}."

[rule.trigger]
as = "gap"
type = "cpu.user"
when = "gap"
`

func TestScan_ManyAnchors_AreCappedPerCondition(t *testing.T) {
	values := constant(1000, 1)
	for gap := range 100 {
		values = withHoles(values, gap*10, 6)
	}

	cpu := []fakeSeries{series("cpu", "cpu.rrd", "value", "%", values)}

	capped := scan(t, scenario{document: gapsDocument, series: cpu})
	if len(capped.Findings) != engine.DefaultEpisodeCap || capped.Findings[0].FromMilliseconds != at(0) || capped.Findings[31].FromMilliseconds != at(310) {
		t.Errorf("findings = %d, want the %d earliest of 100 equal gaps", len(capped.Findings), engine.DefaultEpisodeCap)
	}

	if narrow := scan(t, scenario{document: gapsDocument, series: cpu, episodeCap: 5}); len(narrow.Findings) != 5 {
		t.Errorf("findings with a cap of 5 = %d", len(narrow.Findings))
	}
}

func TestScan_MoreEpisodesThanTheCap_KeepEveryIncidentAndEveryKind(t *testing.T) {
	uptime := make([]float64, 1000)
	for index := range uptime {
		uptime[index] = float64((index + 1) * 60)
		if index >= 400 {
			uptime[index] = float64((index - 399) * 60)
		}
	}

	everySeries := []fakeSeries{series("uptime", "uptime.rrd", "value", "s", uptime)}

	for core := range 40 {
		name := fmt.Sprintf("cpu_%d", core)
		everySeries = append(everySeries, series(name, name+".rrd", "value", "%", withHoles(withHoles(constant(1000, 10), 200, 8), 600, 20)))
	}

	output := scan(t, scenario{document: downDocument, series: everySeries})

	var restarts []int64

	for _, finding := range output.Findings {
		if finding.RuleID == "restart" {
			restarts = append(restarts, finding.FromMilliseconds)
		}
	}

	if want := []int64{at(200), at(399), at(600)}; !slices.Equal(restarts, want) {
		t.Errorf("restart findings start at %v, want %v: the short outage, the reset and the long outage, though the long outage alone holds more gaps than the cap", restarts, want)
	}
}

func TestScan_OverlappingFindingsOfOneRule_KeepOnlyTheFirst(t *testing.T) {
	values := withHoles(withHoles(withHoles(constant(1000, 1), 100, 6), 200, 6), 900, 6)
	cpu := []fakeSeries{series("cpu", "cpu.rrd", "value", "%", values)}

	extended := strings.Replace(gapsDocument, "cause =", "end = [\"gap.end + 10h\"]\ncause =", 1)

	output := scan(t, scenario{document: extended, series: cpu})
	if len(output.Findings) != 2 || output.Findings[0].FromMilliseconds != at(100) || output.Findings[1].FromMilliseconds != at(900) || output.Findings[1].ID != "fd1" {
		t.Errorf("findings = %+v, want the gaps at 100 and 900 with the overlapping one at 200 dropped", output.Findings)
	}

	pinned := strings.Replace(gapsDocument, "cause =", "onset = [\"window.onset\"]\nend = [\"window.onset\"]\ncause =", 1)
	if same := scan(t, scenario{document: pinned, series: cpu}); len(same.Findings) != 1 {
		t.Errorf("findings with identical empty intervals = %d, want 1", len(same.Findings))
	}
}

func TestScan_Viewport_ReadsAroundTheWindowAndOnlyDetectsInsideIt(t *testing.T) {
	document := "[[rule]]\nid = \"busy\"\nseverity = \"warning\"\ntitle = \"Busy\"\ncause = \"Busy.\"\n[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"> 50\"\n"
	cpu := []fakeSeries{series("cpu", "cpu.rrd", "value", "%", withValue(withValue(constant(100, 0), 20, 6, 100), 60, 6, 100))}

	inside := scan(t, scenario{document: document, series: cpu, scope: domain.ScopeViewport, window: engine.Window{FromMilliseconds: at(50), UntilMilliseconds: at(99)}})
	if len(inside.Findings) != 1 || inside.Findings[0].FromMilliseconds != at(60) {
		t.Errorf("viewport findings = %+v, want only the run at 60", inside.Findings)
	}

	beyond := scan(t, scenario{document: document, series: cpu, scope: domain.ScopeViewport, window: engine.Window{FromMilliseconds: at(500), UntilMilliseconds: at(600)}})
	if len(beyond.Findings) != 0 {
		t.Errorf("findings past the data = %+v, want none", beyond.Findings)
	}
}

func TestSemanticOf_DropsTheFirstLabelSegment(t *testing.T) {
	tests := []struct {
		give string
		want string
	}{
		{give: "runtime_heap_objects", want: "heap.objects"},
		{give: "http_requests_rate", want: "requests.rate"},
		{give: "memory", want: "memory"},
	}

	for _, tt := range tests {
		if got := engine.SemanticOf(tt.give); got != tt.want {
			t.Errorf("SemanticOf(%q) = %q, want %q", tt.give, got, tt.want)
		}
	}
}

const burstDocument = `
[[rule]]
id = "loop"
severity = "critical"
title = "Loop"
cause = "Restarted {loop.count} times in {loop.duration}."

[[rule.condition]]
as = "loop"
type = "system.up"
when = "reset"
repeats = 3
repeats_within = "30m"
`

// uptimeRestartingAt counts seconds up from zero and starts again at every listed index.
func uptimeRestartingAt(count int, restarts ...int) []float64 {
	values := make([]float64, count)
	started := 0

	for index := range values {
		if slices.Contains(restarts, index) {
			started = index
		}

		values[index] = float64((index - started + 1) * 60)
	}

	return values
}

func TestScan_Repeats_MergeABurstOfResetsIntoOneFindingThatCountsThem(t *testing.T) {
	output := scan(t, scenario{document: burstDocument, series: []fakeSeries{
		series("uptime", "uptime.rrd", "value", "", uptimeRestartingAt(100, 10, 20, 25, 80)),
	}})

	if len(output.Findings) != 1 {
		t.Fatalf("findings = %+v, want only the burst of three restarts; the one at 80 stands alone", output.Findings)
	}

	finding := output.Findings[0]
	if finding.FromMilliseconds != at(9) || finding.UntilMilliseconds != at(25) {
		t.Errorf("finding = %d..%d, want %d..%d", finding.FromMilliseconds, finding.UntilMilliseconds, at(9), at(25))
	}

	if got := causeText(finding); got != "Restarted 3 times in 16 min." {
		t.Errorf("cause = %q", got)
	}
}

const medianDocument = `
[[rule]]
id = "collapse"
severity = "warning"
title = "Collapse"
cause = "Fell to {http.requests.peak} of its usual level."

[[rule.condition]]
type = "http.requests"
when = "< 20%"
percent_of = "median"
min_duration = "5m"
`

func TestScan_PercentOfMedian_MeasuresAgainstTheSeriesOwnLevelOrWarns(t *testing.T) {
	output := scan(t, scenario{document: medianDocument, series: []fakeSeries{
		series("requests", "requests.rrd", "value", "", withValue(constant(60, 1000), 30, 10, 50)),
		series("requests-idle", "requests-idle.rrd", "value", "", constant(60, 0)),
	}})

	if len(output.Findings) != 1 || output.Findings[0].FromMilliseconds != at(30) || output.Findings[0].Evidence[0].Unit != "%" {
		t.Fatalf("findings = %+v, want the dip at 30 in percent", output.Findings)
	}

	if got := causeText(output.Findings[0]); got != "Fell to 5.0% of its usual level." {
		t.Errorf("cause = %q", got)
	}

	if len(output.Warnings) != 1 || !strings.Contains(output.Warnings[0], "requests-idle.rrd") {
		t.Errorf("warnings = %v, want one about the series with no positive median", output.Warnings)
	}
}

const sinceDocument = `
[[rule]]
id = "growth"
severity = "critical"
title = "Growth"
cause = "Heap grew from {heap.base} to {heap.peak} over {heap.duration}."

[rule.trigger]
as = "restart"
type = "system.up"
when = "reset"

[[rule.condition]]
as = "heap"
type = "heap.objects"
when = "drift"
lookback = "90m"
since = "restart"
`

func TestScan_LookbackSince_StartsAtTheRestartBeforeTheAnchor(t *testing.T) {
	heap := constant(100, 50)
	for index := 20; index < 100; index++ {
		heap[index] = 10 + float64(index-20)/2
	}

	output := scan(t, scenario{document: sinceDocument, series: []fakeSeries{
		series("uptime", "uptime.rrd", "value", "", uptimeRestartingAt(100, 20, 80)),
		series("heap", "heap.rrd", "value", "", heap),
	}})

	if len(output.Findings) != 1 {
		t.Fatalf("findings = %+v, want only the restart at 80: looking back past the restart at 20 would compare against the heap before it", output.Findings)
	}

	if got := causeText(output.Findings[0]); got != "Heap grew from 11.50 to 37.50 over 58 min." {
		t.Errorf("cause = %q", got)
	}
}

const forecastDocument = `
[[rule]]
id = "forecast"
severity = "warning"
title = "Forecast"
cause = "Reaches 60 {cpu.user.eta} after {cpu.user.end}."

[[rule.condition]]
type = "cpu.user"
when = "> 15"
forecast_level = 60
forecast_within = "30m"
`

func TestScan_Forecast_KeepsOnlyEpisodesReachingTheLevelInTimeAndSaysWhen(t *testing.T) {
	climbing := func(from, slope float64) []float64 {
		values := constant(60, 0)
		for index := 20; index < 40; index++ {
			values[index] = from + float64(index-20)*slope
		}

		return values
	}

	output := scan(t, scenario{document: forecastDocument, series: []fakeSeries{
		series("fast", "cpu.rrd", "value", "", climbing(20, 1)),
		series("slow", "cpu-slow.rrd", "value", "", climbing(20, 0.1)),
		series("falling", "cpu-falling.rrd", "value", "", climbing(50, -1)),
	}})

	if len(output.Findings) != 1 || output.Findings[0].Evidence[0].SeriesID != "fast" {
		t.Fatalf("findings = %+v, want only the fast climb: the slow one takes six hours and the falling one never gets there", output.Findings)
	}

	if got := causeText(output.Findings[0]); !strings.HasPrefix(got, "Reaches 60 21 min after ") {
		t.Errorf("cause = %q", got)
	}
}

const gapDurationDocument = `
[[rule]]
id = "silent"
severity = "critical"
title = "Silent"
cause = "Silent for {cpu.user.duration}."

[[rule.condition]]
type = "cpu.user"
when = "gap"
min_duration = "30m"
`

func TestScan_GapSizedByDuration_MeansTheSameOutageAtEveryStep(t *testing.T) {
	const fiveMinutes = 5 * minute

	output := scan(t, scenario{document: gapDurationDocument, series: []fakeSeries{
		series("minutes-short", "cpu-a.rrd", "value", "", withHoles(constant(100, 1), 10, 20)),
		series("minutes-long", "cpu-b.rrd", "value", "", withHoles(constant(100, 1), 50, 40)),
	}})

	if len(output.Findings) != 1 || output.Findings[0].Evidence[0].SeriesID != "minutes-long" {
		t.Fatalf("findings = %+v, want only the forty-minute gap", output.Findings)
	}

	coarse := scan(t, scenario{
		document: gapDurationDocument,
		series:   []fakeSeries{series("five-minute", "cpu.rrd", "value", "", withHoles(constant(100, 1), 50, 8)).withStep(fiveMinutes)},
		window:   engine.Window{FromMilliseconds: origin, UntilMilliseconds: origin + 99*fiveMinutes},
	})

	if len(coarse.Findings) != 1 {
		t.Fatalf("findings = %+v, want the forty-minute gap at a five-minute step, which min_run 6 would size as thirty", coarse.Findings)
	}
}

const strongestOverlapDocument = `
[[rule]]
id = "surge"
severity = "warning"
title = "Surge"
cause = "CPU busy while load peaked at {load.peak}."

[[rule.condition]]
type = "cpu.user"
when = "> 50"

[[rule.condition]]
as = "load"
type = "load.avg"
when = "excursion"
max_episodes = 2
overlaps = "cpu.user"
`

func TestScan_OverlapsAlone_TakesTheStrongestOverlappingEpisodeRatherThanTheEarliest(t *testing.T) {
	load := make([]float64, 100)
	for index := range load {
		load[index] = float64(1 + index%2)
	}

	load = withValue(withValue(load, 22, 3, 20), 30, 3, 90)

	output := scan(t, scenario{document: strongestOverlapDocument, series: []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", withValue(constant(100, 0), 20, 21, 100)),
		series("load", "load.rrd", "value", "", load),
	}})

	if len(output.Findings) != 1 {
		t.Fatalf("findings = %+v, want one", output.Findings)
	}

	if got := causeText(output.Findings[0]); got != "CPU busy while load peaked at 90.00." {
		t.Errorf("cause = %q, want the larger surge though the smaller one started first", got)
	}
}

const supersedingDocument = `
[[rule]]
id = "busy"
severity = "info"
title = "Busy"
cause = "CPU above 50."

[[rule.condition]]
type = "cpu.user"
when = "> 50"

[[rule]]
id = "saturated"
severity = "warning"
title = "Saturated"
supersedes = ["busy"]
cause = "CPU above 80."

[[rule.condition]]
type = "cpu.user"
when = "> 80"
`

func TestScan_Supersedes_LeavesOutTheGeneralFindingOnlyWhereTheSpecificOneOverlapsIt(t *testing.T) {
	cpu := withValue(withValue(constant(100, 0), 20, 11, 90), 60, 11, 60)

	output := scan(t, scenario{document: supersedingDocument, series: []fakeSeries{series("cpu", "cpu.rrd", "value", "%", cpu)}})

	if len(output.Findings) != 2 {
		t.Fatalf("findings = %+v, want the saturation at 20 and the busy stretch at 60", output.Findings)
	}

	saturated, busy := output.Findings[0], output.Findings[1]
	if saturated.RuleID != "saturated" || saturated.FromMilliseconds != at(20) || saturated.ID != "fd0" {
		t.Errorf("first finding = %s %s at %d, want fd0 saturated at %d", saturated.ID, saturated.RuleID, saturated.FromMilliseconds, at(20))
	}

	if busy.RuleID != "busy" || busy.FromMilliseconds != at(60) || busy.ID != "fd1" {
		t.Errorf("second finding = %s %s at %d, want fd1 busy at %d", busy.ID, busy.RuleID, busy.FromMilliseconds, at(60))
	}
}

const joinedToAnUnmatchedOptionalDocument = `
[[rule]]
id = "load-driven"
severity = "info"
title = "Load driven"
cause = "CPU busy."

[[rule.condition]]
type = "cpu.user"
when = "> 50"

[[rule.condition]]
as = "load"
type = "load.avg"
when = "> 5"
optional = true

[[rule.condition]]
as = "requests"
type = "http.requests"
when = "> 5"
after = "load"
within = "10m"
optional = true

[[rule.condition]]
as = "latency"
type = "http.latency"
when = "> 5"
overlaps = "load"
optional = true
`

func TestScan_ConditionsJoinedToAnOptionalOneThatFoundNothing_AreLeftUnmatched(t *testing.T) {
	output := scan(t, scenario{document: joinedToAnUnmatchedOptionalDocument, series: []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", withValue(constant(100, 0), 20, 6, 100)),
		series("requests", "requests.rrd", "value", "", withValue(constant(100, 0), 22, 6, 100)),
		series("latency", "latency.rrd", "value", "ms", withValue(constant(100, 0), 22, 6, 100)),
	}})

	if len(output.Findings) != 1 || len(output.Findings[0].Evidence) != 1 || output.Findings[0].Evidence[0].SeriesID != "cpu" {
		t.Errorf("findings = %+v, want the CPU finding alone: what follows or overlaps a load that was never seen cannot be placed", output.Findings)
	}
}

const unresolvedTokensDocument = `
[[rule]]
id = "unresolved"
severity = "info"
title = "Unresolved"
cause = "Load counted {load.count}; CPU full in {cpu.user.eta}."

[[rule.condition]]
type = "cpu.user"
when = "> 50"

[[rule.condition]]
as = "load"
type = "load.avg"
when = "> 5"
optional = true
`

func TestScan_CountOfAnUnmatchedConditionAndEtaWithoutAForecast_ReadNotAvailable(t *testing.T) {
	output := scan(t, scenario{document: unresolvedTokensDocument, series: []fakeSeries{
		series("cpu", "cpu.rrd", "value", "%", withValue(constant(100, 0), 20, 6, 100)),
	}})

	want := fmt.Sprintf("Load counted %s; CPU full in %s.", render.NotAvailable, render.NotAvailable)
	if len(output.Findings) != 1 || causeText(output.Findings[0]) != want {
		t.Errorf("findings = %+v, want one whose cause reads %q", output.Findings, want)
	}
}

func TestScan_PercentOfASumWhoseOnlyCompanionIsInAnotherFile_AddsThatCompanion(t *testing.T) {
	output := scan(t, scenario{document: percentDocument, series: []fakeSeries{
		series("used", "memory-a.rrd", "used", "B", constant(50, 95)),
		series("free", "memory-b.rrd", "free", "B", constant(50, 5)),
	}})

	if len(output.Warnings) != 0 || len(output.Findings) != 1 || output.Findings[0].RuleID != "memory-full" {
		t.Errorf("Scan = %+v, want memory full at 95%% of used plus the one free series there is, without a warning", output)
	}
}

const shiftDocument = `
[[rule]]
id = "shift"
severity = "info"
title = "Shift"
cause = "Load moved to {load.avg.peak}."

[[rule.condition]]
type = "load.avg"
when = "change_point"
window = "3m"
theta = 1
sustain = 1
`

func TestScan_ChangeCarriedOnlyByTheSmoothingPastTheLastReading_QuotesNoValueItReached(t *testing.T) {
	values := append(constant(10, 0), -6, 0, 0, hole)

	output := scan(t, scenario{document: shiftDocument, series: []fakeSeries{series("load", "load.rrd", "value", "", values)}})

	rise := slices.IndexFunc(output.Findings, func(finding domain.Finding) bool {
		return len(finding.Evidence) == 1 && finding.Evidence[0].Direction == domain.DirectionRising
	})
	if rise < 0 {
		t.Fatalf("findings = %+v, want a rise once the -6 leaves the smoothing", output.Findings)
	}

	evidence := output.Findings[rise].Evidence[0]
	if evidence.FromValue == nil || *evidence.FromValue != 0 || evidence.ToValue != nil {
		t.Errorf("evidence = %+v, want it to start from 0 and name no value reached: no reading follows the change", evidence)
	}

	if got, want := causeText(output.Findings[rise]), "Load moved to "+render.NotAvailable+"."; got != want {
		t.Errorf("cause = %q, want %q", got, want)
	}
}
