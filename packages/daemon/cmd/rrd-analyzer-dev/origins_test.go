package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAllowWebOriginsLetsOnlyTheWebAppCallFromABrowser(t *testing.T) {
	tests := []struct {
		name       string
		origin     string
		wantOrigin string
		wantStatus int
		wantServed bool
	}{
		{name: "the web app", origin: "http://localhost:4200", wantOrigin: "http://localhost:4200", wantStatus: http.StatusNoContent, wantServed: true},
		{name: "a terminal or a test runner", origin: "", wantOrigin: "", wantStatus: http.StatusNoContent, wantServed: true},
		{name: "any other page", origin: "https://example.com", wantOrigin: "", wantStatus: http.StatusForbidden, wantServed: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			served := false
			handler := allowWebOrigins([]string{"http://localhost:4200"}, http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				served = true
				writer.WriteHeader(http.StatusNoContent)
			}))
			request := httptest.NewRequest(http.MethodPost, "/api/dev/reset", http.NoBody)
			if tt.origin != "" {
				request.Header.Set("Origin", tt.origin)
			}
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != tt.wantOrigin {
				t.Errorf("allowed origin = %q, want %q", got, tt.wantOrigin)
			}

			if recorder.Code != tt.wantStatus || served != tt.wantServed {
				t.Errorf("status %d served %v, want %d served %v", recorder.Code, served, tt.wantStatus, tt.wantServed)
			}
		})
	}
}
