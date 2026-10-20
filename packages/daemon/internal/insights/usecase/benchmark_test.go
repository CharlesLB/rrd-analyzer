package usecase_test

import (
	"context"
	"fmt"
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	benchmarkSeriesCount = 40
	benchmarkStep        = int64(120_000)
	benchmarkDays        = 61
	benchmarkStart       = int64(1_780_000_080_000)
)

var benchmarkMetrics = []struct {
	name string
	unit string
	base float64
}{
	{name: "system_memory_used", unit: "B", base: 6e9},
	{name: "runtime_heap_objects", unit: "", base: 9e5},
	{name: "http_latency_p95", unit: "ms", base: 180},
	{name: "http_requests_rate", unit: "req/s", base: 640},
	{name: "system_cpu_user", unit: "%", base: 40},
	{name: "system_network_packets_recv", unit: "pkt/s", base: 12000},
	{name: "system_disk_used_percent", unit: "%", base: 55},
	{name: "runtime_goroutines", unit: "", base: 1400},
}

// benchmarkSource is forty series over two months at a two-minute step: more samples per series
// than the fine budget, so a run takes the two-pass path. Each host goes silent once, after a
// memory climb, at a different point in the window.
func benchmarkSource() *memorySource {
	count := int(benchmarkDays*timeunit.MillisecondsPerDay/benchmarkStep) + 1
	series := make([]seriesDomain.Series, 0, benchmarkSeriesCount)

	for index := range benchmarkSeriesCount {
		metric := benchmarkMetrics[index%len(benchmarkMetrics)]
		host := index / len(benchmarkMetrics)
		outage := count/10 + host*count/6
		generator := &noiseGenerator{state: uint32(index + 1)}
		samples := make([]seriesDomain.Sample, count)

		for row := range samples {
			if row >= outage && row < outage+60 {
				samples[row] = seriesDomain.Unknown()

				continue
			}

			value := metric.base * (1 + 0.2*math.Sin(float64(row)/360) + 0.05*generator.next())
			if row >= outage-300 && row < outage {
				value *= 1 + float64(row-outage+300)/300
			}

			samples[row] = seriesDomain.Known(value)
		}

		file := fmt.Sprintf("host%d_%s.rrd", host, metric.name)
		series = append(series, seriesDomain.Series{
			File: file, Name: file, Label: metric.name, Unit: metric.unit, DataSource: "value", DataSourceType: "GAUGE",
			StartMilliseconds: benchmarkStart, StepMilliseconds: benchmarkStep,
			Archives: []seriesDomain.Archive{{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: benchmarkStep, StartMilliseconds: benchmarkStart, Samples: samples}},
		})
	}

	return newMemorySource(series)
}

func BenchmarkServiceRun_FortySeriesOverTwoMonths_AllData(b *testing.B) {
	source := benchmarkSource()
	configuration := infrastructure.NewConfigurationLoader("")
	request := domain.Request{AnalysisID: "benchmark", Scope: domain.ScopeAll}

	b.ReportAllocs()

	for b.Loop() {
		if _, err := usecase.NewService(source, configuration).Run(context.Background(), request); err != nil {
			b.Fatalf("run: %v", err)
		}
	}
}

func TestServiceRun_FortySeriesOverTwoMonths_TakesTheTwoPassPathAndFindsEachOutage(t *testing.T) {
	source := benchmarkSource()

	report, err := usecase.NewService(source, infrastructure.NewConfigurationLoader("")).Run(context.Background(), domain.Request{AnalysisID: "benchmark", Scope: domain.ScopeAll})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	outages := 0

	for _, finding := range report.Findings {
		if finding.RuleID == "oom-after-memory-climb" {
			outages++

			if finding.Evidence[0].StepMilliseconds != benchmarkStep {
				t.Errorf("outage %s evidence at step %d, want the refined native step", finding.ID, finding.Evidence[0].StepMilliseconds)
			}
		}
	}

	if hosts := benchmarkSeriesCount / len(benchmarkMetrics); outages != hosts {
		t.Errorf("outage findings = %d, want one per host (%d)", outages, hosts)
	}
}
