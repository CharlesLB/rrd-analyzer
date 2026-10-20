package usecase_test

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/synthetic"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	referenceAnchorMilliseconds = 1_788_026_400_000
	referenceTolerance          = 1e-9
)

var referenceFileNames = []string{
	"atlas_runtime_goroutines.rrd",
	"atlas_runtime_gc_pause.rrd",
	"atlas_runtime_heap_objects.rrd",
	"atlas_system_cpu_user.rrd",
	"atlas_system_cpu_system.rrd",
	"atlas_system_memory_used.rrd",
	"atlas_system_network_packets_sent.rrd",
	"atlas_system_network_packets_recv.rrd",
	"atlas_http_requests_rate.rrd",
	"atlas_http_latency_p95.rrd",
}

type referenceStatistics struct {
	Minimum      float64 `json:"min"`
	Maximum      float64 `json:"max"`
	Average      float64 `json:"avg"`
	Percentile95 float64 `json:"p95"`
	Last         float64 `json:"last"`
	Gaps         int     `json:"gaps"`
}

type referenceColumns struct {
	Values     []*float64           `json:"values"`
	Statistics *referenceStatistics `json:"statistics"`
}

type referenceLoader struct{}

func (referenceLoader) Load(callerContext context.Context, files []analysisDomain.SourceFile) ([]seriesDomain.Series, error) {
	names := make([]string, 0, len(files))
	for _, file := range files {
		names = append(names, file.Name)
	}

	return synthetic.NewLoader().Load(callerContext, names)
}

// The reference prototype's own aggregation was run over this dataset and its columns and
// statistics recorded in testdata; a chart and its statistics card must land on the same numbers.
func TestWindowsAndStatisticsMatchTheReferenceAggregation(t *testing.T) {
	content, err := os.ReadFile("testdata/prototype-aggregates.json")
	if err != nil {
		t.Fatalf("read reference aggregates: %v", err)
	}

	reference := map[string]map[string]referenceColumns{}
	if err := json.Unmarshal(content, &reference); err != nil {
		t.Fatalf("decode reference aggregates: %v", err)
	}

	service, _ := newService(referenceLoader{})
	files := make([]analysisDomain.SourceFile, 0, len(referenceFileNames))
	for _, name := range referenceFileNames {
		files = append(files, analysisDomain.SourceFile{Name: name})
	}

	created, err := service.Create(context.Background(), "reference", files)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	bundle, err := service.Open(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	windows := map[string]analysisUsecase.WindowRequest{
		"last24h@260": {FromMilliseconds: referenceAnchorMilliseconds - 24*timeunit.MillisecondsPerHour, Columns: 260},
		"last7d@260":  {FromMilliseconds: referenceAnchorMilliseconds - 7*24*timeunit.MillisecondsPerHour, Columns: 260},
		"last24h@90":  {FromMilliseconds: referenceAnchorMilliseconds - 24*timeunit.MillisecondsPerHour, Columns: 90},
	}

	for name, window := range windows {
		for _, series := range bundle.Series {
			want, known := reference[name][series.Label]
			if !known {
				t.Fatalf("%s: no reference for %s", name, series.Label)
			}

			request := analysisUsecase.WindowRequest{
				AnalysisID:        created.ID,
				SeriesIDs:         []string{series.ID},
				FromMilliseconds:  window.FromMilliseconds,
				UntilMilliseconds: referenceAnchorMilliseconds,
				Columns:           window.Columns,
			}

			assertReferenceColumns(t, service, request, name+" "+series.Label, want)
		}
	}
}

func assertReferenceColumns(t *testing.T, service *analysisUsecase.Service, request analysisUsecase.WindowRequest, label string, want referenceColumns) {
	t.Helper()

	read, err := service.Windows(context.Background(), request)
	if err != nil {
		t.Fatalf("%s: windows: %v", label, err)
	}

	samples := read[0].Samples
	if len(samples) != len(want.Values) {
		t.Fatalf("%s: %d columns, want %d", label, len(samples), len(want.Values))
	}

	for column, expected := range want.Values {
		if (expected == nil) != !samples[column].Present {
			t.Fatalf("%s[%d]: presence %v, want %v", label, column, samples[column].Present, expected != nil)
		}

		if expected != nil && !closeTo(samples[column].Value, *expected) {
			t.Fatalf("%s[%d] = %v, want %v", label, column, samples[column].Value, *expected)
		}
	}

	chart, err := service.Chart(context.Background(), request)
	if err != nil {
		t.Fatalf("%s: chart: %v", label, err)
	}

	got := chart.Statistics[0]
	if (want.Statistics == nil) == got.HasData {
		t.Fatalf("%s: hasData %v, want %v", label, got.HasData, want.Statistics != nil)
	}

	if want.Statistics == nil {
		return
	}

	pairs := map[string][2]float64{
		"minimum":      {got.Statistics.Minimum, want.Statistics.Minimum},
		"maximum":      {got.Statistics.Maximum, want.Statistics.Maximum},
		"average":      {got.Statistics.Average, want.Statistics.Average},
		"percentile95": {got.Statistics.Percentile95, want.Statistics.Percentile95},
		"last":         {got.Statistics.Last, want.Statistics.Last},
	}
	for statistic, pair := range pairs {
		if !closeTo(pair[0], pair[1]) {
			t.Errorf("%s %s = %v, want %v", label, statistic, pair[0], pair[1])
		}
	}

	if got.Statistics.GapCount != want.Statistics.Gaps {
		t.Errorf("%s gaps = %d, want %d", label, got.Statistics.GapCount, want.Statistics.Gaps)
	}
}

func closeTo(got, want float64) bool {
	return math.Abs(got-want) <= referenceTolerance*math.Max(1, math.Abs(want))
}
