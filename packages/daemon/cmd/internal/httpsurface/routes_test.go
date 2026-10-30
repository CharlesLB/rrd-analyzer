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
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/version"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
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
		Sharing:                surface.SharingWiring{Sessions: sharingInfra.NewMemoryRegistry()},
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

// oneSourceDump is an rrdtool dump of one series reading 1, 2 and 3 over three five-minute rows.
const oneSourceDump = `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
	`<ds><name>value</name><type>GAUGE</type></ds>` +
	`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
	`<row><v>1.0e+00</v></row><row><v>2.0e+00</v></row><row><v>3.0e+00</v></row>` +
	`</database></rra></rrd>`

func writtenDump(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(oneSourceDump), 0o600); err != nil {
		t.Fatalf("write the source: %v", err)
	}

	return path
}

func served(t *testing.T, server http.Handler, method string, path string, body string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(method, path, strings.NewReader(body)))

	return recorder
}

func decoded[T any](t *testing.T, recorder *httptest.ResponseRecorder, wantStatus int) T {
	t.Helper()

	if recorder.Code != wantStatus {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, wantStatus, recorder.Body.String())
	}

	var answered T
	if err := json.NewDecoder(recorder.Body).Decode(&answered); err != nil {
		t.Fatalf("decode the answer: %v", err)
	}

	return answered
}

func libraryOf(t *testing.T, server http.Handler) []surface.AnalysisView {
	t.Helper()

	return decoded[[]surface.AnalysisView](t, served(t, server, http.MethodGet, "/api/analyses", ""), http.StatusOK)
}

func TestRoutesAnswerAMalformedBodyAsTheCallersFault(t *testing.T) {
	tests := []struct {
		name       string
		giveMethod string
		givePath   string
	}{
		{name: "run insights", giveMethod: http.MethodPost, givePath: "/api/analyses/any/insights"},
		{name: "create an analysis", giveMethod: http.MethodPost, givePath: "/api/analyses"},
		{name: "rename an analysis", giveMethod: http.MethodPatch, givePath: "/api/analyses/any"},
		{name: "add sources", giveMethod: http.MethodPost, givePath: "/api/analyses/any/sources"},
		{name: "save the canvas", giveMethod: http.MethodPut, givePath: "/api/analyses/any/canvas"},
		{name: "save the library order", giveMethod: http.MethodPut, givePath: "/api/analyses/any/library-order"},
		{name: "fetch series", giveMethod: http.MethodPost, givePath: "/api/series"},
		{name: "fetch a chart", giveMethod: http.MethodPost, givePath: "/api/chart"},
		{name: "remember a search", giveMethod: http.MethodPost, givePath: "/api/search-history/library"},
		{name: "forget a search", giveMethod: http.MethodPost, givePath: "/api/search-history/library/forget"},
		{name: "export a csv", giveMethod: http.MethodPost, givePath: "/api/export/csv"},
		{name: "seed a development analysis", giveMethod: http.MethodPost, givePath: "/api/dev/analyses"},
	}

	server := newServer(t)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := served(t, server, tt.giveMethod, tt.givePath, `{"name":`)

			if recorder.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d: %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestDeleteRouteTakesTheAnalysisOutOfTheLibrary(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, writtenDump(t, "cpu.xml"))

	deleted := served(t, server, http.MethodDelete, "/api/analyses/"+created.ID, "")

	if deleted.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d: %s", deleted.Code, http.StatusNoContent, deleted.Body.String())
	}

	if library := libraryOf(t, server); len(library) != 0 {
		t.Errorf("library after the delete = %+v, want it empty", library)
	}
}

func TestAddSourcesRouteAnswersWithTheAnalysisAndHowManyFilesWereNew(t *testing.T) {
	server := newServer(t)
	listed := writtenDump(t, "cpu.xml")
	created := createAnalysisOver(t, server, listed)
	body, err := json.Marshal(addSourcesBody{Files: []surface.FileInfo{
		{Name: "cpu.xml", Path: listed},
		{Name: "memory.xml", Path: writtenDump(t, "memory.xml")},
	}})
	if err != nil {
		t.Fatalf("encode the request: %v", err)
	}

	added := decoded[surface.AddedSourcesView](t, served(t, server, http.MethodPost, "/api/analyses/"+created.ID+"/sources", string(body)), http.StatusOK)

	if added.Added != 1 || added.Analysis.ID != created.ID {
		t.Errorf("added = %+v, want the one file that was new to %s", added, created.ID)
	}
}

func TestAddSourcesRouteAnswersAnUnknownAnalysisAsNotFound(t *testing.T) {
	recorder := served(t, newServer(t), http.MethodPost, "/api/analyses/missing/sources", `{"files":[{"name":"cpu.xml","path":"/data/cpu.xml"}]}`)

	if recorder.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d: %s", recorder.Code, http.StatusNotFound, recorder.Body.String())
	}
}

func TestCanvasRouteStoresTheChartsTheLibraryListsTheAnalysisWith(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, "")
	drawn := openBundleOver(t, server, created.ID).Series[0]

	saved := served(t, server, http.MethodPut, "/api/analyses/"+created.ID+"/canvas", `{"canvas":[{"seriesId":"`+drawn.ID+`","label":"`+drawn.Label+`","merged":[]}]}`)

	if saved.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d: %s", saved.Code, http.StatusNoContent, saved.Body.String())
	}

	library := libraryOf(t, server)
	if len(library) != 1 || len(library[0].Canvas) != 1 || library[0].Canvas[0].SeriesID != drawn.ID {
		t.Errorf("library = %+v, want the analysis listed with one chart of %s", library, drawn.ID)
	}
}

func TestLibraryOrderRouteListsTheBundlesSeriesInTheOrderSaved(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, "")
	series := openBundleOver(t, server, created.ID).Series
	last := series[len(series)-1]

	saved := served(t, server, http.MethodPut, "/api/analyses/"+created.ID+"/library-order", `{"libraryOrder":[{"seriesId":"`+last.ID+`","label":"`+last.Label+`"}]}`)

	if saved.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d: %s", saved.Code, http.StatusNoContent, saved.Body.String())
	}

	if first := openBundleOver(t, server, created.ID).Series[0]; first.ID != last.ID {
		t.Errorf("first series after the reorder = %s, want %s", first.ID, last.ID)
	}
}

func TestWindowRoutesAnswerAWindowForEachSeriesAsked(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, writtenDump(t, "cpu.xml"))
	bundle := openBundleOver(t, server, created.ID)
	body, err := json.Marshal(analysisUsecase.WindowRequest{
		AnalysisID:        created.ID,
		SeriesIDs:         []string{bundle.Series[0].ID},
		FromMilliseconds:  bundle.FromMilliseconds,
		UntilMilliseconds: bundle.UntilMilliseconds,
		Columns:           3,
	})
	if err != nil {
		t.Fatalf("encode the request: %v", err)
	}

	windows := decoded[[]seriesDomain.Window](t, served(t, server, http.MethodPost, "/api/series", string(body)), http.StatusOK)
	chart := decoded[analysisUsecase.Chart](t, served(t, server, http.MethodPost, "/api/chart", string(body)), http.StatusOK)

	if len(windows) != 1 || windows[0].SeriesID != bundle.Series[0].ID {
		t.Errorf("series windows = %+v, want one of %s", windows, bundle.Series[0].ID)
	}

	if len(chart.Windows) != 1 || len(chart.Statistics) != 1 {
		t.Errorf("chart = %d windows and %d statistics, want one of each", len(chart.Windows), len(chart.Statistics))
	}
}

func TestCSVExportRouteAnswersWithTheDocumentToDownload(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, writtenDump(t, "cpu.xml"))
	body := `{"analysisId":"` + created.ID + `","seriesIds":["s0"],"fromMilliseconds":0,"untilMilliseconds":900000}`

	exported := decoded[csvExport](t, served(t, server, http.MethodPost, "/api/export/csv", body), http.StatusOK)

	if exported.FileName == "" || !strings.HasPrefix(exported.Content, "timestamp,") || exported.SeriesCount != 1 || exported.SampleCount == 0 {
		t.Errorf("exported = %+v, want a named csv of one series under a timestamp header", exported)
	}
}

func TestCSVExportRouteAnswersAnExportOfNoSeriesAsTheCallersFault(t *testing.T) {
	server := newServer(t)
	created := createAnalysisOver(t, server, writtenDump(t, "cpu.xml"))

	recorder := served(t, server, http.MethodPost, "/api/export/csv", `{"analysisId":"`+created.ID+`","untilMilliseconds":900000}`)

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d: %s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
	}
}

func TestDevelopmentAnalysesRouteCreatesTheAnalysisInTheStateItIsGiven(t *testing.T) {
	lastAccessed := time.Date(2026, time.August, 28, 15, 0, 0, 0, time.UTC).UnixMilli()
	body, err := json.Marshal(developmentAnalysisBody{
		Name:                     "Atlas prod",
		Files:                    []surface.FileInfo{{Name: "cpu.xml"}},
		Canvas:                   []analysisDomain.CanvasChart{{SeriesID: "s0", Label: "cpu"}},
		LastAccessedMilliseconds: lastAccessed,
	})
	if err != nil {
		t.Fatalf("encode the request: %v", err)
	}

	created := decoded[surface.AnalysisView](t, served(t, newServer(t), http.MethodPost, "/api/dev/analyses", string(body)), http.StatusOK)

	if created.Name != "Atlas prod" || created.LastAccessedMilliseconds != lastAccessed || len(created.Canvas) != 1 {
		t.Errorf("created = %+v, want Atlas prod opened at %d on one chart", created, lastAccessed)
	}
}
