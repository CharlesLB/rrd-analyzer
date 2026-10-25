package usecase_test

import (
	"context"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const (
	scenarioStart   = int64(1_700_000_100_000)
	scenarioStep    = int64(300_000)
	scenarioSamples = 577
	gibibyte        = float64(1 << 30)

	memoryTotal    = 16 * gibibyte
	memoryCached   = 0.2 * gibibyte
	memoryBuffered = 0.1 * gibibyte

	generatorMultiplier = 1664525
	generatorIncrement  = 1013904223
	generatorModulus    = 4294967296
)

// noiseGenerator is a linear congruential generator, so every fixture is the same on every run and
// the determinism of the engine is not hidden behind random input.
type noiseGenerator struct {
	state uint32
}

func (generator *noiseGenerator) next() float64 {
	generator.state = generator.state*generatorMultiplier + generatorIncrement

	return float64(generator.state)/generatorModulus*2 - 1
}

func generate(seed uint32, valueAt func(index int, noise float64) float64) []float64 {
	generator := &noiseGenerator{state: seed}
	values := make([]float64, scenarioSamples)

	for index := range values {
		values[index] = valueAt(index, generator.next())
	}

	return values
}

func silenced(values []float64, from, until int) []float64 {
	changed := append([]float64(nil), values...)
	for index := from; index < until; index++ {
		changed[index] = math.NaN()
	}

	return changed
}

func scenarioSeries(file, dataSource, unit string, values []float64) seriesDomain.Series {
	samples := make([]seriesDomain.Sample, len(values))
	for index, value := range values {
		samples[index] = seriesDomain.Unknown()
		if !math.IsNaN(value) {
			samples[index] = seriesDomain.Known(value)
		}
	}

	name := strings.TrimSuffix(file, ".rrd")

	return seriesDomain.Series{
		File: file, Name: name, Label: name, Unit: unit, DataSource: dataSource, DataSourceType: "GAUGE",
		StartMilliseconds: scenarioStart, StepMilliseconds: scenarioStep,
		Archives: []seriesDomain.Archive{{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: scenarioStep, StartMilliseconds: scenarioStart, Samples: samples}},
	}
}

// memoryFile is collectd's memory plugin: used, free, cached and buffered as four data sources of
// one file, in bytes, adding up to the machine's memory.
func memoryFile(seed uint32, usedAt func(index int, noise float64) float64, silence func([]float64) []float64) []seriesDomain.Series {
	used := generate(seed, usedAt)
	free := make([]float64, len(used))

	for index, value := range used {
		free[index] = memoryTotal - value - memoryCached - memoryBuffered
	}

	return []seriesDomain.Series{
		scenarioSeries("memory.rrd", "used", "B", silence(used)),
		scenarioSeries("memory.rrd", "free", "B", silence(free)),
		scenarioSeries("memory.rrd", "cached", "B", silence(constantValues(memoryCached))),
		scenarioSeries("memory.rrd", "buffered", "B", silence(constantValues(memoryBuffered))),
	}
}

func constantValues(value float64) []float64 {
	return generate(1, func(int, float64) float64 { return value })
}

func unchanged(values []float64) []float64 {
	return values
}

func benignHost() []seriesDomain.Series {
	return append(memoryFile(12, func(_ int, noise float64) float64 { return 8 * gibibyte * (1 + 0.005*noise) }, unchanged),
		scenarioSeries("disk-sda.rrd", "read", "B/s", generate(11, func(_ int, noise float64) float64 { return 1.2e6 * (1 + 0.05*noise) })),
		scenarioSeries("df-root.rrd", "used", "%", generate(13, func(_ int, noise float64) float64 { return 40 + 0.1*noise })),
		scenarioSeries("uptime.rrd", "value", "s", generate(14, func(index int, _ float64) float64 { return float64(86400 + index*300) })),
		scenarioSeries("cpu_utilization.rrd", "value", "%", generate(15, func(_ int, noise float64) float64 { return 35 + 5*noise })),
	)
}

// oomHost is the out-of-memory host the rules are written around: disk reads climb, memory crosses
// 90% shortly after, and every series goes silent for two and a half hours until the host comes back
// with a fresh uptime.
func oomHost() []seriesDomain.Series {
	down := func(values []float64) []float64 { return silenced(values, 440, 470) }

	disk := generate(21, func(index int, noise float64) float64 {
		switch {
		case index >= 470 || index < 418:
			return 1.2e6 * (1 + 0.05*noise)
		case index < 428:
			return 1.2e6 + (3.4e8-1.2e6)*float64(index-417)/10
		default:
			return 3.4e8 * (1 + 0.005*noise)
		}
	})

	used := func(index int, noise float64) float64 {
		switch {
		case index >= 470 || index < 415:
			return 8 * gibibyte * (1 + 0.005*noise)
		case index <= 425:
			return (8 + 7.6*float64(index-414)/11) * gibibyte
		default:
			return 15.6 * gibibyte
		}
	}

	uptime := generate(23, func(index int, _ float64) float64 {
		if index >= 470 {
			return float64((index - 469) * 300)
		}

		return float64(86400 + index*300)
	})

	return append(memoryFile(22, used, down),
		scenarioSeries("disk-sda.rrd", "read", "B/s", down(disk)),
		scenarioSeries("uptime.rrd", "value", "s", down(uptime)),
	)
}

func diskFillHost() []seriesDomain.Series {
	return []seriesDomain.Series{
		scenarioSeries("df-root.rrd", "used", "%", generate(31, func(index int, noise float64) float64 { return 40 + 45*float64(index)/576 + 0.1*noise })),
	}
}

func uptimeBounceHost() []seriesDomain.Series {
	return []seriesDomain.Series{
		scenarioSeries("uptime.rrd", "value", "s", generate(41, func(index int, _ float64) float64 {
			if index >= 300 {
				return float64(120 + (index-300)*300)
			}

			return float64(86400 + index*300)
		})),
	}
}

func cpuSaturationHost() []seriesDomain.Series {
	return []seriesDomain.Series{
		scenarioSeries("cpu_utilization.rrd", "value", "%", generate(51, func(index int, noise float64) float64 {
			if index >= 200 && index < 260 {
				return 98 + noise
			}

			return 35 + 5*noise
		})),
	}
}

func scenarioConfiguration(t *testing.T) *staticConfiguration {
	t.Helper()

	defaults := defaultConfiguration(t)

	content, err := os.ReadFile(filepath.Join("..", "testdata", "scenario-rules.toml"))
	if err != nil {
		t.Fatalf("read scenario rules: %v", err)
	}

	parsed, diagnostics := rules.Parse(content, "scenario-rules.toml", classify.Types(defaults.Classifier))
	if len(diagnostics) != 0 {
		t.Fatalf("scenario rules do not parse: %+v", diagnostics)
	}

	rulesetHash, err := rules.Hash(parsed)
	if err != nil {
		t.Fatalf("hash scenario rules: %v", err)
	}

	return &staticConfiguration{configuration: domain.Configuration{
		Rules: parsed, Classifier: defaults.Classifier, RulesetHash: rulesetHash, ClassifierHash: defaults.ClassifierHash,
	}}
}

func TestServiceRun_ScenarioRulesets_FireOnlyOnTheIncidentEachFixtureEncodes(t *testing.T) {
	configuration := scenarioConfiguration(t)

	tests := []struct {
		name  string
		give  []seriesDomain.Series
		want  []string
		check func(t *testing.T, findings []domain.Finding)
	}{
		{name: "out of memory after disk I/O", give: oomHost(), want: []string{"oom-from-disk-io", "uptime-bounce"}, check: checkOutOfMemory},
		{name: "disk filling", give: diskFillHost(), want: []string{"disk-filling"}, check: checkDiskFilling},
		{name: "uptime reset bounce", give: uptimeBounceHost(), want: []string{"uptime-bounce"}, check: checkUptimeBounce},
		{name: "cpu saturation without a crash", give: cpuSaturationHost(), want: []string{"cpu-saturated"}, check: checkCPUSaturation},
		{name: "noisy but benign host", give: benignHost()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			report, err := usecase.NewService(newMemorySource(tt.give), configuration).Run(context.Background(), allRequest())
			if err != nil {
				t.Fatalf("run: %v", err)
			}

			ruleIDs := make([]string, 0, len(report.Findings))
			for _, finding := range report.Findings {
				ruleIDs = append(ruleIDs, finding.RuleID)
			}

			if strings.Join(ruleIDs, ",") != strings.Join(tt.want, ",") || len(report.Analyzed.Warnings) != 0 {
				t.Fatalf("findings = %v, warnings %v; want %v and no warnings", ruleIDs, report.Analyzed.Warnings, tt.want)
			}

			if tt.check != nil {
				tt.check(t, report.Findings)
			}
		})
	}
}

func checkOutOfMemory(t *testing.T, findings []domain.Finding) {
	t.Helper()

	crash := findings[0]
	if crash.Severity != domain.SeverityCritical || !crash.Inferred || crash.UntilMilliseconds != scenarioStart+470*scenarioStep {
		t.Errorf("crash = %+v, want an inferred critical finding ending when reporting resumed", crash)
	}

	cause := strings.Join(causeParts(crash), "")
	if !strings.HasPrefix(cause, "System likely went down out of memory. RAM crossed 97.5% about ") || !strings.Contains(cause, " after disk reads rose from 1.") {
		t.Errorf("cause = %q", cause)
	}

	if len(crash.Evidence) != 3 || crash.Evidence[1].Type != "disk.read" || crash.Evidence[2].Type != "memory.used" || crash.Evidence[2].Unit != "%" {
		t.Fatalf("evidence = %+v, want the down anchor, the disk rise and the memory percentage", crash.Evidence)
	}

	lag := crash.Evidence[2].FromMilliseconds - crash.Evidence[1].FromMilliseconds
	if lag <= scenarioStep || lag > 45*60*1000 {
		t.Errorf("memory crossed %d ms after the disk rise, want within the 45 minute allowance", lag)
	}
}

func checkDiskFilling(t *testing.T, findings []domain.Finding) {
	t.Helper()

	filling := findings[0]
	if filling.Evidence[0].Direction != domain.DirectionRising || strings.Join(causeParts(filling), "") != "Disk usage climbed from 39.9% to 85.0% over 2.0 d." {
		t.Errorf("filling = %+v", filling)
	}
}

func checkUptimeBounce(t *testing.T, findings []domain.Finding) {
	t.Helper()

	bounce := findings[0]
	if !bounce.Inferred || bounce.Evidence[0].Direction != domain.DirectionReset || bounce.UntilMilliseconds != scenarioStart+300*scenarioStep {
		t.Errorf("bounce = %+v, want an inferred reset at sample 300", bounce)
	}
}

func checkCPUSaturation(t *testing.T, findings []domain.Finding) {
	t.Helper()

	saturation := findings[0]
	if saturation.Inferred || saturation.FromMilliseconds != scenarioStart+200*scenarioStep || saturation.UntilMilliseconds != scenarioStart+259*scenarioStep {
		t.Errorf("saturation = %+v, want an observed episode over samples 200 to 259", saturation)
	}

	if cause := strings.Join(causeParts(saturation), ""); !strings.HasPrefix(cause, "CPU stayed above 90% for 4.9 h, peaking at 9") {
		t.Errorf("cause = %q", cause)
	}
}

func causeParts(finding domain.Finding) []string {
	parts := make([]string, 0, len(finding.Cause))
	for _, part := range finding.Cause {
		parts = append(parts, part.Text)
	}

	return parts
}
