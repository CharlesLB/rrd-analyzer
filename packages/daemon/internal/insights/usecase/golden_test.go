package usecase_test

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/synthetic"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/render"
)

const (
	goldenAnalysisID  = "prototype"
	relativeTolerance = 1e-9
	sparkWidth        = 60
	sparkTop          = 2
	sparkHeight       = 16
	sparkFallback     = "M0 18 L60 18"
	smallestSparkSpan = 1e-9
)

var (
	prototypeFileNames = []string{
		"atlas_runtime_goroutines.rrd", "atlas_runtime_gc_pause.rrd", "atlas_runtime_heap_objects.rrd",
		"atlas_system_cpu_user.rrd", "atlas_system_cpu_system.rrd", "atlas_system_memory_used.rrd",
		"atlas_system_network_packets_sent.rrd", "atlas_system_network_packets_recv.rrd",
		"atlas_http_requests_rate.rrd", "atlas_http_latency_p95.rrd",
	}

	prototypeSeverities = map[string]domain.Severity{"crit": domain.SeverityCritical, "warn": domain.SeverityWarning, "info": domain.SeverityInfo}
	prototypeDirections = map[string]domain.Direction{"rise": domain.DirectionRising, "gap": domain.DirectionGap, "trend": domain.DirectionTrend}
)

type goldenDocument struct {
	Findings map[string]goldenScope `json:"findings"`
}

type goldenScope struct {
	Window   []int64         `json:"window"`
	Findings []goldenFinding `json:"findings"`
}

type goldenFinding struct {
	ID                string           `json:"id"`
	Severity          string           `json:"severity"`
	Title             string           `json:"title"`
	FromMilliseconds  int64            `json:"fromMilliseconds"`
	UntilMilliseconds int64            `json:"untilMilliseconds"`
	Inferred          bool             `json:"inferred"`
	Match             string           `json:"match"`
	Cause             []goldenPart     `json:"cause"`
	Evidence          []goldenEvidence `json:"evidence"`
}

type goldenPart struct {
	Text     string `json:"text"`
	Emphasis bool   `json:"emphasis"`
}

type goldenEvidence struct {
	Semantic          string   `json:"semantic"`
	Source            string   `json:"source"`
	Kind              string   `json:"kind"`
	FromMilliseconds  int64    `json:"fromMilliseconds"`
	UntilMilliseconds int64    `json:"untilMilliseconds"`
	FromValue         *float64 `json:"fromValue"`
	ToValue           *float64 `json:"toValue"`
	SparkPath         string   `json:"sparkPath"`
}

func loadGolden(t *testing.T) goldenDocument {
	t.Helper()

	content, err := os.ReadFile(filepath.Join("..", "testdata", "prototype-findings.json"))
	if err != nil {
		t.Fatalf("read golden findings: %v", err)
	}

	var document goldenDocument
	if err := json.Unmarshal(content, &document); err != nil {
		t.Fatalf("decode golden findings: %v", err)
	}

	return document
}

func prototypeSource(t testing.TB) *memorySource {
	t.Helper()

	loaded, err := synthetic.NewLoader().Load(context.Background(), prototypeFileNames)
	if err != nil {
		t.Fatalf("load the prototype dataset: %v", err)
	}

	return newMemorySource(loaded)
}

func requestFor(scope goldenScope) domain.Request {
	if len(scope.Window) == 0 {
		return domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeAll}
	}

	return domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeViewport, FromMilliseconds: scope.Window[0], UntilMilliseconds: scope.Window[1]}
}

// prototypeSparkPath is the prototype's own drawing of 26 sparkline points, so the points the engine
// returns can be compared with the paths the reference recorded.
func prototypeSparkPath(points []*float64) string {
	minimum, maximum := math.Inf(1), math.Inf(-1)

	for _, point := range points {
		if point != nil {
			minimum = math.Min(minimum, *point)
			maximum = math.Max(maximum, *point)
		}
	}

	if math.IsInf(maximum, -1) {
		return sparkFallback
	}

	span := math.Max(smallestSparkSpan, maximum-minimum)

	var path strings.Builder

	penDown := false

	for index, point := range points {
		x := render.ToFixed(float64(sparkWidth*index)/float64(len(points)-1), 1)
		if point == nil {
			penDown = false

			continue
		}

		y := render.ToFixed(sparkTop+float64(sparkHeight*(1-(*point-minimum)/span)), 1)
		command := "M"

		if penDown {
			command = "L"
		}

		path.WriteString(command + x + " " + y + " ")

		penDown = true
	}

	return strings.TrimSpace(path.String())
}

func closeEnough(got, want *float64) bool {
	if got == nil || want == nil {
		return got == nil && want == nil
	}

	difference := math.Abs(*got - *want)

	return difference == 0 || difference <= relativeTolerance*math.Max(math.Abs(*got), math.Abs(*want))
}

func describeValue(value *float64) string {
	if value == nil {
		return "null"
	}

	encoded, _ := json.Marshal(*value)

	return string(encoded)
}

func TestServiceRun_PrototypeDatasetWithDefaultRules_ReproducesTheReferenceFindings(t *testing.T) {
	golden := loadGolden(t)
	service := usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader(""))

	for _, scopeName := range []string{"all", "last24h", "last7d", "last3d"} {
		t.Run(scopeName, func(t *testing.T) {
			scope := golden.Findings[scopeName]

			report, err := service.Run(context.Background(), requestFor(scope))
			if err != nil {
				t.Fatalf("run: %v", err)
			}

			if len(report.Analyzed.SeriesUnclassified) != 0 {
				t.Errorf("unclassified = %+v, want every prototype series classified", report.Analyzed.SeriesUnclassified)
			}

			if len(report.Findings) != len(scope.Findings) {
				t.Fatalf("findings = %d, want %d: %+v", len(report.Findings), len(scope.Findings), report.Findings)
			}

			for index, want := range scope.Findings {
				compareFinding(t, report.Findings[index], want)
			}
		})
	}
}

func compareFinding(t *testing.T, got domain.Finding, want goldenFinding) {
	t.Helper()

	if got.ID != want.ID || got.Severity != prototypeSeverities[want.Severity] || got.Title != want.Title || got.Match != want.Match || got.Inferred != want.Inferred {
		t.Errorf("%s header = %s %s %q %q inferred=%v, want %s %s %q %q inferred=%v",
			want.ID, got.ID, got.Severity, got.Title, got.Match, got.Inferred, want.ID, want.Severity, want.Title, want.Match, want.Inferred)
	}

	if got.FromMilliseconds != want.FromMilliseconds || got.UntilMilliseconds != want.UntilMilliseconds {
		t.Errorf("%s interval = %d..%d, want %d..%d", want.ID, got.FromMilliseconds, got.UntilMilliseconds, want.FromMilliseconds, want.UntilMilliseconds)
	}

	if len(got.Cause) != len(want.Cause) {
		t.Errorf("%s cause = %+v, want %+v", want.ID, got.Cause, want.Cause)
	} else {
		for part, wanted := range want.Cause {
			if got.Cause[part].Text != wanted.Text || got.Cause[part].Emphasis != wanted.Emphasis {
				t.Errorf("%s cause part %d = %q emphasis=%v, want %q emphasis=%v", want.ID, part, got.Cause[part].Text, got.Cause[part].Emphasis, wanted.Text, wanted.Emphasis)
			}
		}
	}

	if len(got.Evidence) != len(want.Evidence) {
		t.Fatalf("%s evidence = %d items, want %d", want.ID, len(got.Evidence), len(want.Evidence))
	}

	for item, wanted := range want.Evidence {
		compareEvidence(t, want.ID, item, got.Evidence[item], wanted)
	}
}

func compareEvidence(t *testing.T, findingID string, item int, got domain.Evidence, want goldenEvidence) {
	t.Helper()

	if got.Semantic != want.Semantic || got.Source != want.Source || got.Direction != prototypeDirections[want.Kind] {
		t.Errorf("%s evidence %d = %s %s %s, want %s %s %s", findingID, item, got.Semantic, got.Source, got.Direction, want.Semantic, want.Source, want.Kind)
	}

	if got.FromMilliseconds != want.FromMilliseconds || got.UntilMilliseconds != want.UntilMilliseconds {
		t.Errorf("%s evidence %d span = %d..%d, want %d..%d", findingID, item, got.FromMilliseconds, got.UntilMilliseconds, want.FromMilliseconds, want.UntilMilliseconds)
	}

	if !closeEnough(got.FromValue, want.FromValue) || !closeEnough(got.ToValue, want.ToValue) {
		t.Errorf("%s evidence %d values = %s → %s, want %s → %s", findingID, item,
			describeValue(got.FromValue), describeValue(got.ToValue), describeValue(want.FromValue), describeValue(want.ToValue))
	}

	if path := prototypeSparkPath(got.Spark); path != want.SparkPath {
		t.Errorf("%s evidence %d spark =\n  %s\nwant\n  %s", findingID, item, path, want.SparkPath)
	}
}
