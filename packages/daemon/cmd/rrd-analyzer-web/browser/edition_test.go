package browser_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer-web/browser"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const oneSourceDump = `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
	`<ds><name>value</name><type>GAUGE</type></ds>` +
	`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
	`<row><v>1.0e+00</v></row><row><v>2.0e+00</v></row><row><v>3.0e+00</v></row>` +
	`</database></rra></rrd>`

const sampleChartCount = 4

// sampleFindings are the rules the sample's four incidents are shaped for, in the order the report
// ranks them: the leak that ends in an out-of-memory kill, the bulk import that saturates the
// processor, the deployment's restart, and the latency's drift.
var sampleFindings = []string{"oom-after-memory-climb", "cpu-saturation", "process-restart", "latency-drift"}

var openedAt = time.Date(2026, time.October, 18, 12, 0, 0, 0, time.UTC)

func newEdition(t *testing.T) *browser.Edition {
	t.Helper()

	edition, err := browser.New(context.Background(), openedAt)
	if err != nil {
		t.Fatalf("build the edition: %v", err)
	}

	return edition
}

func call[T any](t *testing.T, edition *browser.Edition, method string, path string, body any) T {
	t.Helper()

	var encoded []byte

	if body != nil {
		marshalled, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode the body of %s %s: %v", method, path, err)
		}

		encoded = marshalled
	}

	answer := edition.Serve(context.Background(), browser.Call{RequestID: path, Method: method, Path: path, Body: encoded})
	if answer.Status != http.StatusOK {
		t.Fatalf("%s %s answered %d: %s", method, path, answer.Status, answer.Body)
	}

	var decoded T
	if err := json.Unmarshal(answer.Body, &decoded); err != nil {
		t.Fatalf("decode the answer of %s %s: %v", method, path, err)
	}

	return decoded
}

func sampleOf(t *testing.T, edition *browser.Edition) surface.AnalysisView {
	t.Helper()

	analyses := call[[]surface.AnalysisView](t, edition, http.MethodGet, "/api/analyses", nil)
	if len(analyses) != 1 {
		t.Fatalf("want the sample analysis alone, got %d analyses", len(analyses))
	}

	return analyses[0]
}

func TestEditionOpensItsLibraryOnTheSampleAnalysis(t *testing.T) {
	sample := sampleOf(t, newEdition(t))

	if sample.Name != "Sample API · production" || len(sample.Canvas) != sampleChartCount || sample.LastAccessedMilliseconds != openedAt.UnixMilli() {
		t.Fatalf("want the sample with its %d charts, opened just now, got %+v", sampleChartCount, sample)
	}
}

func TestEditionSampleCanvasDrawsTheSeriesItNames(t *testing.T) {
	edition := newEdition(t)
	sample := sampleOf(t, edition)

	bundle := call[seriesDomain.Bundle](t, edition, http.MethodGet, "/api/analyses/"+sample.ID+"/bundle", nil)

	labels := make(map[string]string, len(bundle.Series))
	for _, series := range bundle.Series {
		labels[series.ID] = series.Label
	}

	for _, chart := range sample.Canvas {
		if labels[chart.SeriesID] != chart.Label {
			t.Fatalf("chart %s %q draws series labelled %q", chart.SeriesID, chart.Label, labels[chart.SeriesID])
		}

		for _, merged := range chart.Merged {
			if labels[merged.SeriesID] != merged.Label {
				t.Fatalf("chart %q merges %s %q, labelled %q", chart.Label, merged.SeriesID, merged.Label, labels[merged.SeriesID])
			}
		}
	}

	if len(bundle.Canvas) != len(sample.Canvas) {
		t.Fatalf("want %d plotted charts, got %d", len(sample.Canvas), len(bundle.Canvas))
	}
}

func TestEditionSampleGivesTheFindingsItsInsightsAreWrittenAround(t *testing.T) {
	edition := newEdition(t)
	sample := sampleOf(t, edition)

	report := call[insightsDomain.Report](t, edition, http.MethodPost, "/api/analyses/"+sample.ID+"/insights", map[string]string{"scope": "all"})

	rules := make([]string, 0, len(report.Findings))
	for _, finding := range report.Findings {
		rules = append(rules, finding.RuleID)
	}

	if !slices.Equal(rules, sampleFindings) {
		t.Fatalf("want the findings %v, got %v", sampleFindings, rules)
	}
}

func TestEditionHandsThePageTheSampleAndTheLogThatGoesWithIt(t *testing.T) {
	edition := newEdition(t)
	sample := sampleOf(t, edition)

	answered := call[struct {
		AnalysisID string `json:"analysisId"`
		Log        struct {
			FileName string `json:"fileName"`
			Content  string `json:"content"`
		} `json:"log"`
	}](t, edition, http.MethodGet, "/api/sample-analysis", nil)

	if answered.AnalysisID != sample.ID || answered.Log.FileName != "sample-api.ndjson" || answered.Log.Content == "" {
		t.Fatalf("want the sample %s and its log, got analysis %q and log %q of %d bytes",
			sample.ID, answered.AnalysisID, answered.Log.FileName, len(answered.Log.Content))
	}
}

func TestEditionOpensAFileThePageKept(t *testing.T) {
	edition := newEdition(t)
	path := edition.Keep("cpu.xml", []byte(oneSourceDump))

	created := call[surface.AnalysisView](t, edition, http.MethodPost, "/api/analyses", map[string]any{
		"name":  "My server",
		"files": []surface.FileInfo{{Name: "cpu.xml", Path: path, Size: int64(len(oneSourceDump))}},
	})
	bundle := call[seriesDomain.Bundle](t, edition, http.MethodGet, "/api/analyses/"+created.ID+"/bundle", nil)
	missing := call[[]surface.FileInfo](t, edition, http.MethodGet, "/api/analyses/"+created.ID+"/missing-sources", nil)

	if len(bundle.Series) != 1 || len(missing) != 0 {
		t.Fatalf("want one series and nothing missing, got %d series and %v missing", len(bundle.Series), missing)
	}
}

func TestEditionHandsAKeptFileBackByteForByte(t *testing.T) {
	edition := newEdition(t)
	path := edition.Keep("cpu.xml", []byte(oneSourceDump))
	created := call[surface.AnalysisView](t, edition, http.MethodPost, "/api/analyses", map[string]any{
		"name":  "My server",
		"files": []surface.FileInfo{{Name: "cpu.xml", Path: path, Size: int64(len(oneSourceDump))}},
	})

	exported := call[struct {
		Content   string `json:"content"`
		FileCount int    `json:"fileCount"`
	}](t, edition, http.MethodGet, "/api/analyses/"+created.ID+"/sources", nil)

	if exported.FileCount != 1 {
		t.Fatalf("want one file copied, got %d", exported.FileCount)
	}

	if _, err := base64.StdEncoding.DecodeString(exported.Content); err != nil {
		t.Fatalf("want the copy as base64, got %v", err)
	}
}

func TestEditionAnswersARequestItCannotRouteWithTheStatusTheRoutesGive(t *testing.T) {
	answer := newEdition(t).Serve(context.Background(), browser.Call{RequestID: "1", Method: http.MethodGet, Path: "/api/analyses/missing/bundle"})

	if answer.Status != http.StatusNotFound {
		t.Fatalf("want %d, got %d: %s", http.StatusNotFound, answer.Status, answer.Body)
	}
}
