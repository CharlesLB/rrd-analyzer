package httpsurface

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/version"
)

// serverConfiguredFrom serves the surface over a library and a search history kept in memory, with
// sources read off disk or synthesised when they have no path, the way the development server reads
// them, and the development routes added so a test can reset what it wrote.
func serverConfiguredFrom(t *testing.T, configurationDirectory string) http.Handler {
	t.Helper()

	files := surface.DiskSourceFiles()
	files.Loader = surface.NewSampleFallbackLoader(files.Loader)

	operations := surface.Build(surface.Wiring{
		Store:                  analysisInfra.NewMemoryStore(),
		SearchHistory:          searchesInfra.NewMemoryStore(),
		Files:                  files,
		ConfigurationDirectory: configurationDirectory,
		Picker:                 UnavailableDialogs{},
		SaveTargets:            UnavailableDialogs{},
		Writer:                 UnavailableDialogs{},
	})

	mux := Routes(operations)
	RegisterDevelopmentRoutes(mux, operations)

	return mux
}

func newServer(t *testing.T) http.Handler {
	t.Helper()

	return serverConfiguredFrom(t, t.TempDir())
}

func TestInsightsRouteAnswersAnInvalidRequestAsTheCallersFault(t *testing.T) {
	tests := []struct {
		name       string
		givePath   string
		giveBody   string
		wantStatus int
	}{
		{name: "unknown scope", givePath: "/api/analyses/any/insights", giveBody: `{"scope":"everything"}`, wantStatus: http.StatusBadRequest},
		{name: "viewport without a window", givePath: "/api/analyses/any/insights", giveBody: `{"scope":"viewport","fromMilliseconds":5,"untilMilliseconds":5}`, wantStatus: http.StatusBadRequest},
		{name: "unknown analysis", givePath: "/api/analyses/missing/insights", giveBody: `{"scope":"all"}`, wantStatus: http.StatusNotFound},
	}

	server := newServer(t)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, tt.givePath, strings.NewReader(tt.giveBody))
			recorder := httptest.NewRecorder()

			server.ServeHTTP(recorder, request)

			if recorder.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d: %s", recorder.Code, tt.wantStatus, recorder.Body.String())
			}
		})
	}
}

func TestBundleRouteAnswersASourceItCannotReadAsTheCallersFault(t *testing.T) {
	directory := t.TempDir()
	notADump := filepath.Join(directory, "notes.txt")
	if err := os.WriteFile(notADump, []byte("plain text, not an rrd"), 0o600); err != nil {
		t.Fatalf("write the source: %v", err)
	}

	tests := []struct {
		name     string
		givePath string
	}{
		{name: "a file that is not an rrd", givePath: notADump},
		{name: "a file that is no longer there", givePath: filepath.Join(directory, "moved.rrd")},
	}

	server := newServer(t)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			created := createAnalysisOver(t, server, tt.givePath)
			request := httptest.NewRequest(http.MethodGet, "/api/analyses/"+created.ID+"/bundle", http.NoBody)
			recorder := httptest.NewRecorder()

			server.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusUnprocessableEntity {
				t.Errorf("status = %d, want %d: %s", recorder.Code, http.StatusUnprocessableEntity, recorder.Body.String())
			}
		})
	}
}

func TestMissingSourcesRouteNamesTheFileThatIsNoLongerOnDisk(t *testing.T) {
	server := newServer(t)
	moved := filepath.Join(t.TempDir(), "moved.rrd")
	created := createAnalysisOver(t, server, moved)

	request := httptest.NewRequest(http.MethodGet, "/api/analyses/"+created.ID+"/missing-sources", http.NoBody)
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var missing []surface.FileInfo
	if err := json.NewDecoder(recorder.Body).Decode(&missing); err != nil {
		t.Fatalf("decode the missing sources: %v", err)
	}

	if len(missing) != 1 || missing[0].Path != moved {
		t.Errorf("missing = %+v, want only %s", missing, moved)
	}
}

func createAnalysisOver(t *testing.T, server http.Handler, path string) surface.AnalysisView {
	t.Helper()

	body, err := json.Marshal(createAnalysisBody{Files: []surface.FileInfo{{Name: filepath.Base(path), Path: path}}})
	if err != nil {
		t.Fatalf("encode the request: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/analyses", bytes.NewReader(body))
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("create status = %d: %s", recorder.Code, recorder.Body.String())
	}

	var created surface.AnalysisView
	if err := json.NewDecoder(recorder.Body).Decode(&created); err != nil {
		t.Fatalf("decode the created analysis: %v", err)
	}

	return created
}

func TestRenameRouteAnswersWithTheRenamedAnalysisAndRefusesABlankName(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, filepath.Join(t.TempDir(), "cpu.rrd"))

	tests := []struct {
		name       string
		giveBody   string
		wantStatus int
		wantName   string
	}{
		{name: "a name", giveBody: `{"name":"  Atlas prod  "}`, wantStatus: http.StatusOK, wantName: "Atlas prod"},
		{name: "a blank name", giveBody: `{"name":"   "}`, wantStatus: http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPatch, "/api/analyses/"+created.ID, strings.NewReader(tt.giveBody))
			recorder := httptest.NewRecorder()

			server.ServeHTTP(recorder, request)

			if recorder.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d: %s", recorder.Code, tt.wantStatus, recorder.Body.String())
			}

			var renamed surface.AnalysisView
			if tt.wantName != "" && (json.NewDecoder(recorder.Body).Decode(&renamed) != nil || renamed.Name != tt.wantName) {
				t.Errorf("renamed = %+v, want the name %q", renamed, tt.wantName)
			}
		})
	}
}

func TestSourcesRouteAnswersWithTheSourceBytesToDownload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cpu.rrd")
	if err := os.WriteFile(path, []byte("RRD\x00cpu"), 0o600); err != nil {
		t.Fatalf("write the source: %v", err)
	}

	server := newServer(t)
	created := createAnalysisOver(t, server, path)
	request := httptest.NewRequest(http.MethodGet, "/api/analyses/"+created.ID+"/sources", http.NoBody)
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)

	var exported sourcesExport
	if recorder.Code != http.StatusOK || json.NewDecoder(recorder.Body).Decode(&exported) != nil {
		t.Fatalf("status = %d, want a decodable %d", recorder.Code, http.StatusOK)
	}

	if exported.FileName != "cpu.rrd" || string(exported.Content) != "RRD\x00cpu" || exported.FileCount != 1 {
		t.Errorf("exported = %+v, want cpu.rrd holding its bytes", exported)
	}
}

func TestBuildRouteAnswersWithTheStampedIdentity(t *testing.T) {
	server := newServer(t)
	request := httptest.NewRequest(http.MethodGet, "/api/build", http.NoBody)
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)

	var build surface.BuildInfo
	if recorder.Code != http.StatusOK || json.NewDecoder(recorder.Body).Decode(&build) != nil {
		t.Fatalf("status = %d, want a decodable %d", recorder.Code, http.StatusOK)
	}

	if build.Summary != version.Summary() || build.Version != version.Version {
		t.Errorf("build = %+v, want the summary %q", build, version.Summary())
	}
}

func TestInsightsConfigurationRouteMovesItsRulesetHashWhenTheRulesFileIsEdited(t *testing.T) {
	directory := t.TempDir()
	server := serverConfiguredFrom(t, directory)

	before := configurationStampOf(t, server)

	edited := `[[rule]]
id = "latency-drift"
severity = "warning"
title = "p95 latency trending upward"
match = "slow trend"
interval = "window"
cause = "p95 latency drifted from {latency.base} to {latency.peak}."

[[rule.condition]]
as = "latency"
type = "http.latency"
when = "drift"
`
	if err := os.WriteFile(filepath.Join(directory, "rules.toml"), []byte(edited), 0o600); err != nil {
		t.Fatalf("write the rules: %v", err)
	}

	after := configurationStampOf(t, server)

	if before.RulesetHash == "" || after.RulesetHash == before.RulesetHash {
		t.Errorf("ruleset hash before %q, after %q; want a hash that moves with the edit", before.RulesetHash, after.RulesetHash)
	}

	if after.ClassifierHash != before.ClassifierHash {
		t.Errorf("classifier hash moved from %q to %q though only the rules changed", before.ClassifierHash, after.ClassifierHash)
	}
}

func configurationStampOf(t *testing.T, server http.Handler) insightsDomain.ConfigurationStamp {
	t.Helper()

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/insights/configuration", http.NoBody))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}

	var stamp insightsDomain.ConfigurationStamp
	if err := json.NewDecoder(recorder.Body).Decode(&stamp); err != nil {
		t.Fatalf("decode the stamp: %v", err)
	}

	return stamp
}

func TestSourcesRouteRefusesToHandOutAFileThatIsNotASource(t *testing.T) {
	path := filepath.Join(t.TempDir(), "id_rsa")
	if err := os.WriteFile(path, []byte("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n"), 0o600); err != nil {
		t.Fatalf("write the file: %v", err)
	}

	server := newServer(t)
	created := createAnalysisOver(t, server, path)
	request := httptest.NewRequest(http.MethodGet, "/api/analyses/"+created.ID+"/sources", http.NoBody)
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnprocessableEntity || strings.Contains(recorder.Body.String(), "b3BlbnNzaC1rZXk") {
		t.Errorf("status = %d answering %q, want %d and none of the file's bytes", recorder.Code, recorder.Body.String(), http.StatusUnprocessableEntity)
	}
}

func openBundleOver(t *testing.T, server http.Handler, analysisID string) seriesDomain.Bundle {
	t.Helper()

	request := httptest.NewRequest(http.MethodGet, "/api/analyses/"+analysisID+"/bundle", http.NoBody)
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("bundle status = %d: %s", recorder.Code, recorder.Body.String())
	}

	var bundle seriesDomain.Bundle
	if err := json.NewDecoder(recorder.Body).Decode(&bundle); err != nil {
		t.Fatalf("decode the bundle: %v", err)
	}

	return bundle
}

func TestSeriesColorRouteStoresTheColorTheBundleIsDrawnIn(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, "")
	recolored := openBundleOver(t, server, created.ID).Series[1]

	body := `{"seriesId":"` + recolored.ID + `","label":"` + recolored.Label + `","color":"#AABBCC"}`
	request := httptest.NewRequest(http.MethodPut, "/api/analyses/"+created.ID+"/series-color", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, http.StatusNoContent, recorder.Body.String())
	}

	if got := openBundleOver(t, server, created.ID).Series[1]; got.ID != recolored.ID || got.Color != "#aabbcc" {
		t.Errorf("reopened series = %s in %q, want %s in %q", got.ID, got.Color, recolored.ID, "#aabbcc")
	}
}

func TestSeriesColorRouteRefusesAColorItCannotStoreAndAnUnknownAnalysis(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, "")

	tests := []struct {
		name           string
		giveAnalysisID string
		giveBody       string
		wantStatus     int
	}{
		{name: "a color not written #rrggbb", giveAnalysisID: created.ID, giveBody: `{"seriesId":"s0","label":"cpu","color":"teal"}`, wantStatus: http.StatusBadRequest},
		{name: "a malformed body", giveAnalysisID: created.ID, giveBody: `{"seriesId":`, wantStatus: http.StatusBadRequest},
		{name: "an unknown analysis", giveAnalysisID: "missing", giveBody: `{"seriesId":"s0","label":"cpu","color":"#aabbcc"}`, wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPut, "/api/analyses/"+tt.giveAnalysisID+"/series-color", strings.NewReader(tt.giveBody))
			recorder := httptest.NewRecorder()

			server.ServeHTTP(recorder, request)

			if recorder.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d: %s", recorder.Code, tt.wantStatus, recorder.Body.String())
			}
		})
	}
}

func searchHistoryOf(t *testing.T, server http.Handler, method string, path string, body string) (int, []string) {
	t.Helper()

	request := httptest.NewRequest(method, path, strings.NewReader(body))
	recorder := httptest.NewRecorder()

	server.ServeHTTP(recorder, request)

	var history []string
	if recorder.Code == http.StatusOK {
		if err := json.NewDecoder(recorder.Body).Decode(&history); err != nil {
			t.Fatalf("decode the history: %v", err)
		}
	}

	return recorder.Code, history
}

func TestSearchHistoryRoutesAnswerEachChangeWithTheFieldsHistory(t *testing.T) {
	server := newServer(t)

	searchHistoryOf(t, server, http.MethodPost, "/api/search-history/chart-library", `{"term":"cpu"}`)
	_, remembered := searchHistoryOf(t, server, http.MethodPost, "/api/search-history/chart-library", `{"term":" memory "}`)
	_, forgotten := searchHistoryOf(t, server, http.MethodPost, "/api/search-history/chart-library/forget", `{"term":"cpu"}`)
	_, other := searchHistoryOf(t, server, http.MethodGet, "/api/search-history/library", "")

	if strings.Join(remembered, ",") != "memory,cpu" {
		t.Errorf("history after remembering = %q, want the trimmed term first", remembered)
	}

	if strings.Join(forgotten, ",") != "memory" {
		t.Errorf("history after forgetting = %q, want only memory", forgotten)
	}

	if len(other) != 0 {
		t.Errorf("another field's history = %q, want none", other)
	}
}

func TestSearchHistoryRouteAnswersABlankTermAsTheCallersFault(t *testing.T) {
	status, _ := searchHistoryOf(t, newServer(t), http.MethodPost, "/api/search-history/chart-library", `{"term":"  "}`)

	if status != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", status, http.StatusBadRequest)
	}
}

func TestDevelopmentResetForgetsEverySearch(t *testing.T) {
	server := newServer(t)

	searchHistoryOf(t, server, http.MethodPost, "/api/search-history/library", `{"term":"prod"}`)
	searchHistoryOf(t, server, http.MethodPost, "/api/dev/reset", "")
	_, history := searchHistoryOf(t, server, http.MethodGet, "/api/search-history/library", "")

	if len(history) != 0 {
		t.Errorf("history after a reset = %q, want none", history)
	}
}
