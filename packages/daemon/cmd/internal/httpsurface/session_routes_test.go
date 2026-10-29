package httpsurface

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/memoryfiles"
	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
)

const sharedLinkRoute = "/app/#/shared/"

// sharingServer serves the surface publishing to the share service at serviceURL, and following
// sessions into keeper when there is one.
func sharingServer(t *testing.T, serviceURL string, keeper sharingDomain.FileKeeper) http.Handler {
	t.Helper()

	return Routes(surface.Build(surface.Wiring{
		Store:         analysisInfra.NewMemoryStore(),
		SearchHistory: searchesInfra.NewMemoryStore(),
		Files:         surface.DiskSourceFiles(),
		Picker:        UnavailableDialogs{},
		SaveTargets:   UnavailableDialogs{},
		Writer:        UnavailableDialogs{},
		Sharing:       surface.SharingWiring{ServiceURL: serviceURL, Sessions: sharingInfra.NewMemoryRegistry(), Keeper: keeper},
	}))
}

// exchanged sends one request and answers with the status and the body read as JSON fields.
func exchanged(t *testing.T, server http.Handler, method string, path string, body string) (int, map[string]any) {
	t.Helper()

	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(method, path, strings.NewReader(body)))

	fields := map[string]any{}
	if strings.HasPrefix(recorder.Header().Get("Content-Type"), jsonContentType) {
		if err := json.Unmarshal(recorder.Body.Bytes(), &fields); err != nil && !strings.HasPrefix(recorder.Body.String(), "[") {
			t.Fatalf("decode %s %s: %v", method, path, err)
		}
	}

	return recorder.Code, fields
}

func fieldNames(fields map[string]any) []string {
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}

	slices.Sort(names)

	return names
}

func writtenSource(t *testing.T) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "cpu.xml")
	if err := os.WriteFile(path, []byte(oneSourceDump), 0o600); err != nil {
		t.Fatalf("write the source: %v", err)
	}

	return path
}

func TestSessionRoutes_AnOwnerAndAViewer_SpeakTheContractOfDocsSharing(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	owner := sharingServer(t, service.URL()+"/", nil)
	viewer := sharingServer(t, service.URL(), memoryfiles.New())
	created := createAnalysisOver(t, owner, writtenSource(t))
	sessionPath := "/api/analyses/" + created.ID + "/session"

	status, started := exchanged(t, owner, http.MethodPost, sessionPath, `{"log":{"name":"service.log","content":"line","view":{"shown":true}}}`)
	wantStatusFields := []string{"analysisId", "expiresAtMilliseconds", "files", "link", "log", "revision", "sessionId"}
	if status != http.StatusCreated || !slices.Equal(fieldNames(started), wantStatusFields) {
		t.Fatalf("start = %d with %v, want 201 with %v", status, fieldNames(started), wantStatusFields)
	}

	link, _ := started["link"].(string)
	if !strings.HasPrefix(link, service.URL()+sharedLinkRoute) {
		t.Errorf("link = %q, want it under %s%s without a doubled slash", link, service.URL(), sharedLinkRoute)
	}

	for _, call := range []struct{ method, path, body string }{
		{method: http.MethodPut, path: sessionPath, body: `{"log":{"name":"service.log","view":{"shown":false}}}`},
		{method: http.MethodGet, path: sessionPath},
	} {
		if status, _ := exchanged(t, owner, call.method, call.path, call.body); status != http.StatusOK {
			t.Errorf("%s %s = %d, want 200", call.method, call.path, status)
		}
	}

	sessionID, key, _ := strings.Cut(strings.TrimPrefix(link, service.URL()+sharedLinkRoute), "/")
	joinBody, _ := json.Marshal(map[string]string{"sessionId": sessionID, "key": key})

	status, joined := exchanged(t, viewer, http.MethodPost, "/api/shared-sessions", string(joinBody))
	wantJoinedFields := []string{"analysisId", "changed", "expiresAtMilliseconds", "liveUrl", "log", "revision", "sessionId"}
	if status != http.StatusCreated || !slices.Equal(fieldNames(joined), wantJoinedFields) {
		t.Fatalf("join = %d with %v, want 201 with %v", status, fieldNames(joined), wantJoinedFields)
	}

	if log, _ := joined["log"].(map[string]any); log["content"] != "line" || log["name"] != "service.log" {
		t.Errorf("joined log = %v, want the owner's log", joined["log"])
	}

	viewerCalls := []struct {
		method, path string
		wantStatus   int
	}{
		{method: http.MethodPost, path: "/api/shared-sessions/" + sessionID + "/refresh", wantStatus: http.StatusOK},
		{method: http.MethodDelete, path: "/api/shared-sessions/" + sessionID, wantStatus: http.StatusNoContent},
		{method: http.MethodPost, path: "/api/shared-sessions/" + sessionID + "/refresh", wantStatus: http.StatusNotFound},
	}

	for _, call := range viewerCalls {
		if status, _ := exchanged(t, viewer, call.method, call.path, ""); status != call.wantStatus {
			t.Errorf("%s %s = %d, want %d", call.method, call.path, status, call.wantStatus)
		}
	}

	ownerCalls := []struct {
		method, path string
		wantStatus   int
	}{
		{method: http.MethodGet, path: "/api/sessions", wantStatus: http.StatusOK},
		{method: http.MethodDelete, path: sessionPath, wantStatus: http.StatusNoContent},
		{method: http.MethodGet, path: sessionPath, wantStatus: http.StatusNotFound},
	}

	for _, call := range ownerCalls {
		if status, _ := exchanged(t, owner, call.method, call.path, ""); status != call.wantStatus {
			t.Errorf("%s %s = %d, want %d", call.method, call.path, status, call.wantStatus)
		}
	}
}

func TestSessionRoutes_WhatABuildCannotDo_IsSaidInTheStatus(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	unconfigured := sharingServer(t, "", nil)
	desktopLike := sharingServer(t, service.URL(), nil)

	tests := []struct {
		name       string
		giveServer http.Handler
		giveMethod string
		givePath   string
		giveBody   string
		wantStatus int
	}{
		{name: "listing with no service", giveServer: unconfigured, giveMethod: http.MethodGet, givePath: "/api/sessions", wantStatus: http.StatusServiceUnavailable},
		{name: "starting with no service", giveServer: unconfigured, giveMethod: http.MethodPost, givePath: "/api/analyses/a/session", giveBody: `{}`, wantStatus: http.StatusServiceUnavailable},
		{name: "joining with no service", giveServer: unconfigured, giveMethod: http.MethodPost, givePath: "/api/shared-sessions", giveBody: `{}`, wantStatus: http.StatusServiceUnavailable},
		{name: "joining where nothing is kept in memory", giveServer: desktopLike, giveMethod: http.MethodPost, givePath: "/api/shared-sessions", giveBody: `{}`, wantStatus: http.StatusNotImplemented},
		{name: "a publication that is not JSON", giveServer: desktopLike, giveMethod: http.MethodPut, givePath: "/api/analyses/a/session", giveBody: `{`, wantStatus: http.StatusBadRequest},
		{name: "a start that is not JSON", giveServer: desktopLike, giveMethod: http.MethodPost, givePath: "/api/analyses/a/session", giveBody: `{`, wantStatus: http.StatusBadRequest},
		{name: "a join that is not JSON", giveServer: desktopLike, giveMethod: http.MethodPost, givePath: "/api/shared-sessions", giveBody: `{`, wantStatus: http.StatusBadRequest},
		{name: "a publication of an analysis not live", giveServer: desktopLike, giveMethod: http.MethodPut, givePath: "/api/analyses/a/session", giveBody: `{}`, wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if status, _ := exchanged(t, tt.giveServer, tt.giveMethod, tt.givePath, tt.giveBody); status != tt.wantStatus {
				t.Errorf("status = %d, want %d", status, tt.wantStatus)
			}
		})
	}
}

func TestBuildRoute_SaysWhetherTheBuildSharesSessions(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	tests := []struct {
		name       string
		giveServer http.Handler
		want       bool
	}{
		{name: "given a share service", giveServer: sharingServer(t, service.URL(), nil), want: true},
		{name: "given none", giveServer: sharingServer(t, "", nil), want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, build := exchanged(t, tt.giveServer, http.MethodGet, "/api/build", ""); build["sharesSessions"] != tt.want {
				t.Errorf("sharesSessions = %v, want %v", build["sharesSessions"], tt.want)
			}
		})
	}
}
