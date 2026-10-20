package engine_test

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/engine"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	origin      = int64(1_000_000_000_000)
	minute      = timeunit.MillisecondsPerMinute
	analysisID  = "engine-test"
	testRuleSet = "engine_test.toml"
)

var (
	hole = math.NaN()

	errReadRefused = errors.New("fake reader: read refused")

	testClassifier = []domain.ClassifierEntry{
		{Type: "system.up", NameAny: []string{"uptime"}},
		{Type: "memory.used", FileAny: []string{"memory"}, DataSourceAny: []string{"used"}},
		{Type: "memory.free", FileAny: []string{"memory"}, DataSourceAny: []string{"free"}},
		{Type: "heap.objects", NameAny: []string{"heap"}},
		{Type: "cpu.user", NameAny: []string{"cpu"}},
		{Type: "load.avg", NameAny: []string{"load"}},
		{Type: "disk.read", NameAny: []string{"disk"}},
		{Type: "http.requests", NameAny: []string{"requests"}},
		{Type: "http.latency", NameAny: []string{"latency"}},
	}
)

type fakeSeries struct {
	info        domain.SeriesInfo
	start       int64
	values      []float64
	archiveStep int64
}

func series(identifier, file, dataSource, unit string, values []float64) fakeSeries {
	return fakeSeries{
		info:   domain.SeriesInfo{ID: identifier, File: file, Label: strings.TrimSuffix(file, ".rrd"), DataSource: dataSource, Unit: unit, StepMilliseconds: minute},
		start:  origin,
		values: values,
	}
}

func (fake fakeSeries) withStep(step int64) fakeSeries {
	fake.info.StepMilliseconds = step

	return fake
}

// withArchiveStep lays the values out at their own step while reporting a coarser archive behind
// them, the way a read of history kept only at a coarse step arrives.
func (fake fakeSeries) withArchiveStep(step int64) fakeSeries {
	fake.archiveStep = step

	return fake
}

func (fake fakeSeries) withMaximum(maximum float64) fakeSeries {
	fake.info.DataSourceMaximum = &maximum

	return fake
}

// fakeReader serves every consolidation function from the same values, consolidating by the mean
// of present rows when a read allows fewer samples than the window holds.
type fakeReader struct {
	series      []fakeSeries
	refuse      string
	refuseAfter int
	zeroStep    string
	cancel      context.CancelFunc
	requests    []domain.ReadRequest
	readCount   int
}

func (reader *fakeReader) Read(callerContext context.Context, request domain.ReadRequest) (domain.Samples, error) {
	if err := callerContext.Err(); err != nil {
		return domain.Samples{}, err
	}

	reader.requests = append(reader.requests, request)
	reader.readCount++

	if reader.cancel != nil {
		reader.cancel()
	}

	if request.SeriesID == reader.refuse || (reader.refuseAfter > 0 && reader.readCount > reader.refuseAfter) {
		return domain.Samples{}, errReadRefused
	}

	for _, fake := range reader.series {
		if fake.info.ID != request.SeriesID {
			continue
		}

		step := fake.info.StepMilliseconds
		if request.SeriesID == reader.zeroStep {
			return domain.Samples{Function: request.Function, Values: fake.values}, nil
		}

		first := max(0, int(math.Ceil(float64(request.FromMilliseconds-fake.start)/float64(step))))
		last := min(len(fake.values)-1, int(math.Floor(float64(request.UntilMilliseconds-fake.start)/float64(step))))
		samples := domain.Samples{StartMilliseconds: fake.start + int64(first)*step, StepMilliseconds: step, ArchiveStepMilliseconds: max(step, fake.archiveStep), Function: request.Function}

		if first > last {
			return samples, nil
		}

		rows := fake.values[first : last+1]
		if request.MaximumSamples <= 0 || len(rows) <= request.MaximumSamples {
			samples.Values = rows

			return samples, nil
		}

		perBucket := (len(rows) + request.MaximumSamples - 1) / request.MaximumSamples
		samples.StepMilliseconds = int64(perBucket) * step
		samples.Values = consolidate(rows, perBucket)

		return samples, nil
	}

	return domain.Samples{}, errReadRefused
}

func consolidate(rows []float64, perBucket int) []float64 {
	var buckets []float64

	for start := 0; start < len(rows); start += perBucket {
		sum, count := 0.0, 0

		for _, value := range rows[start:min(len(rows), start+perBucket)] {
			if !math.IsNaN(value) {
				sum += value
				count++
			}
		}

		mean := math.NaN()
		if count > 0 {
			mean = sum / float64(count)
		}

		buckets = append(buckets, mean)
	}

	return buckets
}

type scenario struct {
	document         string
	series           []fakeSeries
	scope            domain.Scope
	window           engine.Window
	episodeCap       int
	fineSampleBudget int
}

func parseRules(t *testing.T, document string) []domain.Rule {
	t.Helper()

	parsed, diagnostics := rules.Parse([]byte(document), testRuleSet, classify.Types(testClassifier))
	if len(diagnostics) != 0 {
		t.Fatalf("test ruleset does not parse: %+v", diagnostics)
	}

	return parsed
}

func inputFor(t *testing.T, test scenario, parsed []domain.Rule) engine.Input {
	t.Helper()

	infos := make([]domain.SeriesInfo, 0, len(test.series))
	longest := 0

	for _, fake := range test.series {
		infos = append(infos, fake.info)
		longest = max(longest, len(fake.values))
	}

	window := test.window
	if window == (engine.Window{}) {
		window = engine.Window{FromMilliseconds: origin, UntilMilliseconds: origin + int64(longest-1)*minute}
	}

	return engine.Input{
		AnalysisID:       analysisID,
		Scope:            cmpScope(test.scope),
		Window:           window,
		Rules:            parsed,
		Classification:   classify.Classify(testClassifier, infos),
		EpisodeCap:       test.episodeCap,
		FineSampleBudget: test.fineSampleBudget,
	}
}

func cmpScope(scope domain.Scope) domain.Scope {
	if scope == "" {
		return domain.ScopeAll
	}

	return scope
}

func scan(t *testing.T, test scenario) engine.Output {
	t.Helper()

	output, err := scanWith(context.Background(), t, test, &fakeReader{series: test.series})
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}

	return output
}

func scanWith(callerContext context.Context, t *testing.T, test scenario, reader *fakeReader) (engine.Output, error) {
	t.Helper()

	reader.series = test.series

	return engine.Scan(callerContext, reader, inputFor(t, test, parseRules(t, test.document)))
}

func constant(count int, value float64) []float64 {
	values := make([]float64, count)
	for index := range values {
		values[index] = value
	}

	return values
}

func withHoles(values []float64, from, count int) []float64 {
	changed := append([]float64(nil), values...)
	for index := from; index < from+count; index++ {
		changed[index] = hole
	}

	return changed
}

func withValue(values []float64, from, count int, value float64) []float64 {
	changed := append([]float64(nil), values...)
	for index := from; index < from+count; index++ {
		changed[index] = value
	}

	return changed
}

// withBump adds a triangle of the given height centred on an index, reaching zero halfWidth away.
func withBump(values []float64, center, halfWidth int, height float64) []float64 {
	changed := append([]float64(nil), values...)
	for index := center - halfWidth + 1; index < center+halfWidth; index++ {
		distance := math.Abs(float64(index - center))
		changed[index] += height * (1 - distance/float64(halfWidth))
	}

	return changed
}

func at(index int) int64 {
	return origin + int64(index)*minute
}

func causeText(finding domain.Finding) string {
	var text strings.Builder
	for _, part := range finding.Cause {
		text.WriteString(part.Text)
	}

	return text.String()
}
