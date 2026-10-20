package rules_test

import (
	"slices"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

const (
	origin = "rules.toml"

	header        = "[[rule]]\nid = \"r\"\nseverity = \"warning\"\ntitle = \"T\"\n"
	peakCause     = "cause = \"Peak {cpu.user.peak}.\"\n"
	plainCause    = "cause = \"x\"\n"
	cpuRising     = "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"rising\"\n"
	loadRising    = "[[rule.condition]]\ntype = \"load.avg\"\nwhen = \"rising\"\n"
	requestRising = "[[rule.condition]]\ntype = \"http.requests\"\nwhen = \"rising\"\n"
	validRule     = header + peakCause + cpuRising

	oomFromDiskIO = `
[[rule]]
id = "oom-from-disk-io"
severity = "critical"
title = "Crash from out-of-memory triggered by disk I/O"
trigger = "system.down"
cause = "RAM crossed {memory.used.peak} about {disk.read→memory.used.lag} after reads rose from {disk.read.base} to {disk.read.peak}."

[[rule.condition]]
type = "disk.read"
when = "rising"
cf = "MAX"
window = "15m"
lookback = "1h"

[[rule.condition]]
type = "memory.used"
when = "> 90%"
percent_of = { sum = ["memory.used", "memory.free", "memory.cached", "memory.buffered"] }
after = "disk.read"
within = "10m"
`
)

var knownTypes = []string{
	"memory.used", "memory.free", "memory.cached", "memory.buffered", "disk.read", "cpu.user",
	"http.requests", "http.latency", "heap.objects", "system.up", "load.avg",
}

func hashOf(t *testing.T, ruleset []domain.Rule) string {
	t.Helper()

	hash, err := rules.Hash(ruleset)
	if err != nil {
		t.Fatalf("hash: %v", err)
	}

	return hash
}

func diagnosticTypes(diagnostics []domain.Diagnostic) []string {
	types := make([]string, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		types = append(types, diagnostic.Type)
	}

	return types
}

func TestParse_WorkedExample_FillsDefaultsAndResolvesTheAnchor(t *testing.T) {
	parsed, diagnostics := rules.Parse([]byte(oomFromDiskIO), origin, knownTypes)
	if len(diagnostics) != 0 || len(parsed) != 1 {
		t.Fatalf("Parse = %d rules, diagnostics %+v; want one clean rule", len(parsed), diagnostics)
	}

	rule := parsed[0]
	if rule.Trigger == nil || rule.Trigger.Alias != domain.TypeSystemDown || rule.Trigger.When.Detector != domain.DetectorDown || rule.Anchor != domain.TypeSystemDown {
		t.Errorf("trigger = %+v anchor %q, want an inferred system.down anchoring the rule", rule.Trigger, rule.Anchor)
	}

	if rule.Trigger.Parameters.MinimumRun != 6 || rule.Trigger.Parameters.DropFraction != 0.5 {
		t.Errorf("trigger parameters = %+v, want the gap and reset defaults", rule.Trigger.Parameters)
	}

	disk, memory := rule.Conditions[0], rule.Conditions[1]
	if disk.Function != domain.FunctionMaximum || disk.Parameters.SmoothingMilliseconds != 900000 || disk.LookbackMilliseconds != 3600000 ||
		disk.Parameters.Theta != 3 || disk.Parameters.Sustain != 3 {
		t.Errorf("disk.read = %+v, want MAX, a 15 minute window, a one hour lookback and default theta and sustain", disk)
	}

	wantWhen := domain.When{Detector: domain.DetectorThreshold, Comparison: domain.ComparisonAbove, Level: 90, Percent: true}
	if memory.When != wantWhen || memory.Function != domain.FunctionAverage || memory.WithinMilliseconds != 600000 ||
		memory.PercentOf.Kind != domain.PercentSum || len(memory.PercentOf.Sum) != 4 || memory.After != "disk.read" {
		t.Errorf("memory.used = %+v, want a 90%% threshold over a four-type sum, after disk.read within 10 minutes", memory)
	}

	if got := strings.Join(rule.Evidence, ","); got != "system.down,disk.read,memory.used" {
		t.Errorf("evidence = %s, want the trigger then the conditions", got)
	}

	if rule.Interval != domain.IntervalEpisodes || len(rule.Cause) != 9 {
		t.Errorf("interval %q with %d cause segments, want episodes and 9 segments", rule.Interval, len(rule.Cause))
	}
}

func TestParse_BelowAndSpikeConditions_DefaultToTheArchiveThatKeepsTheirExtreme(t *testing.T) {
	document := header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"< 5\"\n" +
		"[[rule.condition]]\ntype = \"load.avg\"\nwhen = \"spike\"\nlevel = 4\nmax_duration = \"15m\"\n" +
		"[[rule.condition]]\ntype = \"http.latency\"\nwhen = \"> 250\"\nmin_duration = \"10m\"\n"

	parsed, diagnostics := rules.Parse([]byte(document), origin, knownTypes)
	if len(diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v", diagnostics)
	}

	conditions := parsed[0].Conditions
	if conditions[0].Function != domain.FunctionMinimum || conditions[1].Function != domain.FunctionMaximum || conditions[2].Function != domain.FunctionAverage {
		t.Errorf("functions = %s, %s, %s; want MIN, MAX, AVERAGE", conditions[0].Function, conditions[1].Function, conditions[2].Function)
	}

	if *conditions[1].Parameters.Level != 4 || conditions[1].Parameters.MaximumDurationMilliseconds != 900000 || conditions[2].Parameters.MinimumDurationMilliseconds != 600000 {
		t.Errorf("parameters = %+v and %+v", conditions[1].Parameters, conditions[2].Parameters)
	}
}

func TestParse_EachValidationFailure_RejectsTheRuleWithItsDiagnostic(t *testing.T) {
	tests := []struct {
		name     string
		give     string
		wantType string
	}{
		{name: "unknown rule key", give: header + peakCause + "colour = \"red\"\n" + cpuRising, wantType: rules.DiagnosticUnknownKey},
		{name: "unknown condition key", give: validRule + "speed = 3\n", wantType: rules.DiagnosticUnknownKey},
		{name: "unknown trigger key", give: header + "cause = \"Down.\"\n[rule.trigger]\ntype = \"system.down\"\nspeed = 1\n", wantType: rules.DiagnosticUnknownKey},
		{name: "unknown percent_of key", give: header + plainCause + "[[rule.condition]]\ntype = \"memory.used\"\nwhen = \"> 90%\"\npercent_of = { summ = [\"memory.free\"] }\n", wantType: rules.DiagnosticUnknownKey},
		{name: "invalid id", give: "[[rule]]\nid = \"Bad Id\"\nseverity = \"warning\"\ntitle = \"T\"\n" + peakCause + cpuRising, wantType: rules.DiagnosticInvalidID},
		{name: "unknown severity", give: "[[rule]]\nid = \"r\"\nseverity = \"urgent\"\ntitle = \"T\"\n" + peakCause + cpuRising, wantType: rules.DiagnosticUnknownSeverity},
		{name: "missing title", give: "[[rule]]\nid = \"r\"\nseverity = \"warning\"\n" + peakCause + cpuRising, wantType: rules.DiagnosticMissingField},
		{name: "missing cause", give: header + cpuRising, wantType: rules.DiagnosticMissingField},
		{name: "no condition", give: header + peakCause, wantType: rules.DiagnosticMissingField},
		{name: "unknown interval", give: header + peakCause + "interval = \"forever\"\n" + cpuRising, wantType: rules.DiagnosticInvalidInterval},
		{name: "unknown type", give: header + plainCause + "[[rule.condition]]\ntype = \"gpu.temp\"\nwhen = \"rising\"\n", wantType: rules.DiagnosticUnknownType},
		{name: "missing type", give: header + plainCause + "[[rule.condition]]\nwhen = \"rising\"\n", wantType: rules.DiagnosticMissingField},
		{name: "unknown when", give: header + peakCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"sideways\"\n", wantType: rules.DiagnosticUnknownWhen},
		{name: "missing when", give: header + peakCause + "[[rule.condition]]\ntype = \"cpu.user\"\n", wantType: rules.DiagnosticMissingField},
		{name: "unknown consolidation function", give: validRule + "cf = \"MEDIAN\"\n", wantType: rules.DiagnosticInvalidFunction},
		{name: "malformed duration", give: validRule + "window = \"5 minutes\"\n", wantType: rules.DiagnosticMalformedDuration},
		{name: "zero duration", give: validRule + "window = \"0m\"\n", wantType: rules.DiagnosticMalformedDuration},
		{name: "within without after", give: validRule + loadRising + "within = \"10m\"\n", wantType: rules.DiagnosticInvalidReference},
		{name: "anchor alongside a trigger", give: header + "anchor = \"cpu.user\"\ntrigger = \"system.down\"\n" + peakCause + cpuRising, wantType: rules.DiagnosticInvalidReference},
		{name: "anchor naming no condition", give: header + "anchor = \"ghost\"\n" + peakCause + cpuRising, wantType: rules.DiagnosticUnknownAlias},
		{name: "after naming no condition", give: validRule + loadRising + "after = \"ghost\"\n", wantType: rules.DiagnosticUnknownAlias},
		{name: "after naming a later condition", give: validRule + loadRising + "after = \"http.requests\"\n" + requestRising, wantType: rules.DiagnosticLaterAlias},
		{name: "overlaps naming a later condition", give: validRule + loadRising + "overlaps = \"http.requests\"\n" + requestRising, wantType: rules.DiagnosticLaterAlias},
		{name: "anchor referencing another condition", give: validRule + "after = \"load.avg\"\n" + loadRising, wantType: rules.DiagnosticLaterAlias},
		{name: "cycle between two conditions", give: validRule + loadRising + "after = \"http.requests\"\n" + requestRising + "after = \"load.avg\"\n", wantType: rules.DiagnosticCycle},
		{name: "condition after itself", give: validRule + loadRising + "after = \"load.avg\"\n", wantType: rules.DiagnosticCycle},
		{name: "parameter of another detector", give: validRule + "min_run = 3\n", wantType: rules.DiagnosticParameterNotApplicable},
		{name: "count below one", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"gap\"\nmin_run = 0\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "fraction above one", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"excursion\"\nthreshold_fraction = 2\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "negative theta", give: validRule + "theta = -1\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "negative median guard", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"excursion\"\npeak_over_median = -1\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "non-finite level", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"excursion\"\npeak_at_least = nan\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "percent_of on a plain level", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"> 90\"\npercent_of = \"self\"\n", wantType: rules.DiagnosticInvalidPercentOf},
		{name: "percentage without percent_of", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"> 90%\"\n", wantType: rules.DiagnosticInvalidPercentOf},
		{name: "unknown percent_of", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"> 90%\"\npercent_of = \"total\"\n", wantType: rules.DiagnosticInvalidPercentOf},
		{name: "percent_of sum of an unknown type", give: header + plainCause + "[[rule.condition]]\ntype = \"memory.used\"\nwhen = \"> 90%\"\npercent_of = { sum = [\"gpu.temp\"] }\n", wantType: rules.DiagnosticUnknownType},
		{name: "empty percent_of sum", give: header + plainCause + "[[rule.condition]]\ntype = \"memory.used\"\nwhen = \"> 90%\"\npercent_of = { sum = [] }\n", wantType: rules.DiagnosticInvalidPercentOf},
		{name: "unclosed token", give: header + "cause = \"Peak {cpu.user.peak\"\n" + cpuRising, wantType: rules.DiagnosticInvalidTemplate},
		{name: "malformed token", give: header + "cause = \"Peak {cpu.user}\"\n" + cpuRising, wantType: rules.DiagnosticInvalidTemplate},
		{name: "stray closing brace", give: header + "cause = \"a } b\"\n" + cpuRising, wantType: rules.DiagnosticInvalidTemplate},
		{name: "token naming no condition", give: header + "cause = \"{memory.peak}\"\n" + cpuRising, wantType: rules.DiagnosticUnresolvedToken},
		{name: "window has no base", give: header + "cause = \"{window.base}\"\n" + cpuRising, wantType: rules.DiagnosticUnresolvedToken},
		{name: "evidence listing a condition twice", give: header + peakCause + "evidence = [\"cpu.user\", \"cpu.user\"]\n" + cpuRising, wantType: rules.DiagnosticInvalidEvidence},
		{name: "evidence naming no condition", give: header + peakCause + "evidence = [\"ghost\", \"cpu.user\"]\n" + cpuRising, wantType: rules.DiagnosticInvalidEvidence},
		{name: "evidence leaving a condition out", give: header + peakCause + "evidence = [\"cpu.user\"]\n" + cpuRising + loadRising, wantType: rules.DiagnosticInvalidEvidence},
		{name: "malformed instant", give: header + peakCause + "onset = [\"cpu.user.start\"]\n" + cpuRising, wantType: rules.DiagnosticInvalidInstant},
		{name: "instant naming no condition", give: header + peakCause + "end = [\"ghost.end\"]\n" + cpuRising, wantType: rules.DiagnosticUnknownAlias},
		{name: "duplicate alias", give: validRule + cpuRising, wantType: rules.DiagnosticDuplicateAlias},
		{name: "reserved alias", give: validRule + "as = \"window\"\n", wantType: rules.DiagnosticInvalidAlias},
		{name: "optional anchor", give: validRule + "optional = true\n", wantType: rules.DiagnosticInvalidReference},
		{name: "anchor looking back", give: validRule + "lookback = \"1h\"\n", wantType: rules.DiagnosticInvalidReference},
		{name: "trigger of the wrong kind", give: header + peakCause + "trigger = 3\n" + cpuRising, wantType: rules.DiagnosticInvalidRule},
		{name: "trigger that does not decode", give: header + plainCause + "[rule.trigger]\ntype = \"system.down\"\nmin_run = \"six\"\n", wantType: rules.DiagnosticInvalidRule},
		{name: "rule that does not decode", give: "[[rule]]\nid = \"r\"\nseverity = \"warning\"\ntitle = 3\n" + peakCause + cpuRising, wantType: rules.DiagnosticInvalidRule},
		{name: "partial cause naming no condition", give: validRule + "[rule.partial]\ncause = \"{ghost.peak}\"\n", wantType: rules.DiagnosticUnresolvedToken},
		{name: "repeats below two", give: header + plainCause + "[[rule.condition]]\ntype = \"system.up\"\nwhen = \"reset\"\nrepeats = 1\nrepeats_within = \"30m\"\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "repeats without repeats_within", give: header + plainCause + "[[rule.condition]]\ntype = \"system.up\"\nwhen = \"reset\"\nrepeats = 3\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "repeats_within without repeats", give: header + plainCause + "[[rule.condition]]\ntype = \"system.up\"\nwhen = \"reset\"\nrepeats_within = \"30m\"\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "tolerance above one", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"flat\"\ntolerance = 2\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "tolerance on another detector", give: validRule + "tolerance = 0.1\n", wantType: rules.DiagnosticParameterNotApplicable},
		{name: "window has no count", give: header + "cause = \"{window.count}\"\n" + cpuRising, wantType: rules.DiagnosticUnresolvedToken},
		{name: "finding has no eta", give: header + "cause = \"{finding.eta}\"\n" + cpuRising, wantType: rules.DiagnosticUnresolvedToken},
		{name: "forecast_within without forecast_level", give: validRule + "forecast_within = \"30d\"\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "non-finite forecast level", give: validRule + "forecast_level = inf\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "since without lookback", give: validRule + loadRising + "since = \"cpu.user\"\n", wantType: rules.DiagnosticInvalidReference},
		{name: "since naming no condition", give: validRule + loadRising + "lookback = \"1h\"\nsince = \"ghost\"\n", wantType: rules.DiagnosticUnknownAlias},
		{name: "since naming a later condition", give: validRule + loadRising + "lookback = \"1h\"\nsince = \"http.requests\"\n" + requestRising, wantType: rules.DiagnosticLaterAlias},
		{name: "gap sized twice", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"gap\"\nmin_run = 3\nmin_duration = \"30m\"\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "no episodes allowed", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"excursion\"\nmax_episodes = 0\n", wantType: rules.DiagnosticInvalidParameter},
		{name: "superseding an invalid id", give: header + peakCause + "supersedes = [\"Not An Id\"]\n" + cpuRising, wantType: rules.DiagnosticInvalidReference},
		{name: "superseding itself", give: header + peakCause + "supersedes = [\"r\"]\n" + cpuRising, wantType: rules.DiagnosticInvalidReference},
		{name: "episodes on a drift", give: header + plainCause + "[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"drift\"\nmax_episodes = 3\n", wantType: rules.DiagnosticParameterNotApplicable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, diagnostics := rules.Parse([]byte(tt.give), origin, knownTypes)

			if len(parsed) != 0 {
				t.Errorf("Parse loaded %+v, want the rule rejected", parsed)
			}

			if !slices.Contains(diagnosticTypes(diagnostics), tt.wantType) {
				t.Fatalf("diagnostics = %v, want one of type %s", diagnostics, tt.wantType)
			}

			for _, diagnostic := range diagnostics {
				if diagnostic.Origin != origin || diagnostic.Title == "" || diagnostic.Detail == "" {
					t.Errorf("diagnostic %+v lacks an origin, title or detail", diagnostic)
				}
			}
		})
	}
}

func TestParse_FlatRepeatsAndMedian_FillTheirDefaults(t *testing.T) {
	document := header + "cause = \"{loop.count} restarts; cpu stuck at {cpu.user.base}; load at {load.peak}.\"\n" +
		"[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"flat\"\n" +
		"[[rule.condition]]\nas = \"loop\"\ntype = \"system.up\"\nwhen = \"reset\"\nrepeats = 3\nrepeats_within = \"30m\"\noptional = true\n" +
		"[[rule.condition]]\nas = \"load\"\ntype = \"load.avg\"\nwhen = \"< 20%\"\npercent_of = \"median\"\noptional = true\n"

	parsed, diagnostics := rules.Parse([]byte(document), origin, knownTypes)
	if len(diagnostics) != 0 || len(parsed) != 1 {
		t.Fatalf("Parse = %+v, %+v; want one rule and no diagnostics", parsed, diagnostics)
	}

	flat, loop, load := parsed[0].Conditions[0], parsed[0].Conditions[1], parsed[0].Conditions[2]

	if flat.Parameters.Tolerance != signal.DefaultFlatTolerance || flat.Parameters.MinimumDurationMilliseconds != signal.DefaultFlatMinimumDuration {
		t.Errorf("flat parameters = %+v, want the default tolerance and minimum duration", flat.Parameters)
	}

	if loop.Repeats != 3 || loop.RepeatsWithinMilliseconds != 30*60*1000 {
		t.Errorf("loop repeats = %d within %d, want 3 within thirty minutes", loop.Repeats, loop.RepeatsWithinMilliseconds)
	}

	if load.PercentOf.Kind != domain.PercentMedian || load.Function != domain.FunctionMinimum {
		t.Errorf("load = %+v, want a percentage of the median read from MIN", load)
	}
}

func TestParse_SinceForecastEpisodesAndGapDuration_FillTheirFields(t *testing.T) {
	document := header + "cause = \"{heap.duration}; {disk.eta}; {cpu.user.peak}\"\n" +
		"[rule.trigger]\nas = \"restart\"\ntype = \"system.up\"\nwhen = \"reset\"\n" +
		"[[rule.condition]]\nas = \"heap\"\ntype = \"heap.objects\"\nwhen = \"drift\"\nlookback = \"10d\"\nsince = \"restart\"\nmin_duration = \"1d\"\n" +
		"[[rule.condition]]\nas = \"disk\"\ntype = \"disk.read\"\nwhen = \"rising\"\nforecast_level = 90\nforecast_within = \"60d\"\noptional = true\n" +
		"[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"excursion\"\nmax_episodes = 4\noptional = true\n" +
		"[[rule.condition]]\nas = \"silence\"\ntype = \"load.avg\"\nwhen = \"gap\"\nmin_duration = \"30m\"\noptional = true\n"

	parsed, diagnostics := rules.Parse([]byte(document), origin, knownTypes)
	if len(diagnostics) != 0 || len(parsed) != 1 {
		t.Fatalf("Parse = %+v, %+v; want one rule and no diagnostics", parsed, diagnostics)
	}

	heap, disk, cpu, silence := parsed[0].Conditions[0], parsed[0].Conditions[1], parsed[0].Conditions[2], parsed[0].Conditions[3]

	if heap.Since != "restart" || heap.Parameters.MinimumDurationMilliseconds != 24*60*60*1000 {
		t.Errorf("heap = %+v, want a drift since the restart lasting at least a day", heap)
	}

	if disk.ForecastLevel == nil || *disk.ForecastLevel != 90 || disk.ForecastWithinMilliseconds != 60*24*60*60*1000 {
		t.Errorf("disk forecast = %v within %d, want 90 within sixty days", disk.ForecastLevel, disk.ForecastWithinMilliseconds)
	}

	if cpu.Parameters.MaximumEpisodes != 4 || silence.Parameters.MinimumDurationMilliseconds != 30*60*1000 {
		t.Errorf("cpu episodes = %d, silence duration = %d; want 4 and thirty minutes", cpu.Parameters.MaximumEpisodes, silence.Parameters.MinimumDurationMilliseconds)
	}
}

func TestParse_MalformedRule_DoesNotSinkAValidOne(t *testing.T) {
	document := strings.Replace(validRule, "id = \"r\"", "id = \"broken\"", 1) + "when_else = 1\n\n" + strings.Replace(validRule, "id = \"r\"", "id = \"kept\"", 1)

	parsed, diagnostics := rules.Parse([]byte(document), origin, knownTypes)

	if len(parsed) != 1 || parsed[0].ID != "kept" {
		t.Errorf("Parse = %+v, want only the valid rule", parsed)
	}

	if len(diagnostics) != 1 || diagnostics[0].RuleID != "broken" || diagnostics[0].Type != rules.DiagnosticUnknownKey {
		t.Errorf("diagnostics = %+v, want one unknown key on broken", diagnostics)
	}
}

func TestParse_DocumentLevelProblems(t *testing.T) {
	tests := []struct {
		name      string
		give      string
		wantRules int
		wantTypes []string
	}{
		{name: "unknown top-level key keeps the rules", give: "version = 1\n" + validRule, wantRules: 1, wantTypes: []string{rules.DiagnosticUnknownKey}},
		{name: "duplicate id rejects the second", give: validRule + validRule, wantRules: 1, wantTypes: []string{rules.DiagnosticDuplicateID}},
		{name: "not TOML", give: "[[rule]\n", wantTypes: []string{rules.DiagnosticUnreadableDocument}},
		{name: "rule is not an array of tables", give: "rule = 3\n", wantTypes: []string{rules.DiagnosticUnreadableDocument}},
		{name: "missing id names the rule by position", give: "[[rule]]\nseverity = \"warning\"\ntitle = \"T\"\n" + peakCause + cpuRising, wantTypes: []string{rules.DiagnosticInvalidID}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, diagnostics := rules.Parse([]byte(tt.give), origin, knownTypes)

			if len(parsed) != tt.wantRules || !slices.Equal(diagnosticTypes(diagnostics), tt.wantTypes) {
				t.Errorf("Parse = %d rules, %v; want %d rules, %v", len(parsed), diagnosticTypes(diagnostics), tt.wantRules, tt.wantTypes)
			}
		})
	}

	_, diagnostics := rules.Parse([]byte("[[rule]]\nseverity = \"warning\"\ntitle = \"T\"\n"+peakCause+cpuRising), origin, knownTypes)
	if !strings.HasPrefix(diagnostics[0].Detail, "rule #1: ") {
		t.Errorf("detail = %q, want the rule named by its position", diagnostics[0].Detail)
	}
}

func TestParse_PartialAndTriggerTable_InheritAndAlias(t *testing.T) {
	document := header + "match = \"order matches\"\n" + peakCause +
		"[rule.trigger]\nas = \"outage\"\ntype = \"cpu.user\"\nwhen = \"> 90%\"\npercent_of = \"self\"\n" +
		"[[rule.condition]]\nas = \"load\"\ntype = \"load.avg\"\nwhen = \"rising\"\noptional = true\nlookback = \"2h\"\n" +
		"[rule.partial]\ntitle = \"T without load\"\n"

	document = strings.Replace(document, "{cpu.user.peak}", "{outage.peak} {load→outage.lag}", 1)

	parsed, diagnostics := rules.Parse([]byte(document), origin, knownTypes)
	if len(diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v", diagnostics)
	}

	rule := parsed[0]
	if rule.Anchor != "outage" || rule.Trigger.PercentOf.Kind != domain.PercentSelf {
		t.Errorf("anchor %q percent_of %+v, want the trigger table's alias and self", rule.Anchor, rule.Trigger.PercentOf)
	}

	if rule.Partial.Title != "T without load" || rule.Partial.Match != "order matches" || len(rule.Partial.Cause) != len(rule.Cause) {
		t.Errorf("partial = %+v, want its own title and the rule's match and cause", rule.Partial)
	}

	if ordered := rule.EvaluationOrder(); ordered[0].Alias != "outage" || ordered[1].Alias != "load" {
		t.Errorf("evaluation order = %+v, want the trigger first", ordered)
	}
}

func TestEvaluationOrder_NamedAnchor_ComesFirstThenDeclarationOrder(t *testing.T) {
	document := header + "anchor = \"http.requests\"\n" + peakCause + cpuRising + loadRising + requestRising

	parsed, diagnostics := rules.Parse([]byte(document), origin, knownTypes)
	if len(diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v", diagnostics)
	}

	var aliases []string
	for _, condition := range parsed[0].EvaluationOrder() {
		aliases = append(aliases, condition.Alias)
	}

	if got := strings.Join(aliases, ","); got != "http.requests,cpu.user,load.avg" {
		t.Errorf("evaluation order = %s, want the anchor then declaration order", got)
	}
}

func TestMergeAndHash_UserRulesReplaceInPlaceAndHashTheParsedForm(t *testing.T) {
	defaults := []domain.Rule{{ID: "a"}, {ID: "b", Title: "default"}}
	overrides := []domain.Rule{{ID: "c"}, {ID: "b", Title: "user"}}

	merged := rules.Merge(defaults, overrides)
	if len(merged) != 3 || merged[0].ID != "a" || merged[1].Title != "user" || merged[2].ID != "c" {
		t.Errorf("Merge = %+v, want a, the user's b, then c", merged)
	}

	if defaults[1].Title != "default" {
		t.Error("Merge changed the defaults it was given")
	}

	spelledOut, _ := rules.Parse([]byte(header+plainCause+"[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"gap\"\nmin_run = 6\n"), origin, knownTypes)
	defaulted, _ := rules.Parse([]byte(header+plainCause+"[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"gap\"\n"), origin, knownTypes)
	changed, _ := rules.Parse([]byte(header+plainCause+"[[rule.condition]]\ntype = \"cpu.user\"\nwhen = \"gap\"\nmin_run = 7\n"), origin, knownTypes)

	if hashOf(t, spelledOut) != hashOf(t, defaulted) {
		t.Error("a default spelled out hashed differently from the default left implicit")
	}

	if hashOf(t, changed) == hashOf(t, defaulted) {
		t.Error("a changed parameter did not change the hash")
	}
}

func TestParse_PercentOfWithSeveralUnknownKeys_ReportsThemInKeyOrderEveryTime(t *testing.T) {
	content := []byte(header + plainCause + "[[rule.condition]]\ntype = \"memory.used\"\nwhen = \"> 90%\"\n" +
		"percent_of = { sum = [\"memory.free\"], zeta = 1, alpha = 2, mid = 3 }\n")

	for range 20 {
		_, diagnostics := rules.Parse(content, origin, knownTypes)

		details := make([]string, 0, len(diagnostics))
		for _, diagnostic := range diagnostics {
			details = append(details, diagnostic.Detail)
		}

		joined := strings.Join(details, "|")
		positions := []int{strings.Index(joined, `"alpha"`), strings.Index(joined, `"mid"`), strings.Index(joined, `"zeta"`)}
		if positions[0] < 0 || !slices.IsSorted(positions) {
			t.Fatalf("diagnostics = %q, want alpha, mid, zeta in that order", joined)
		}
	}
}
