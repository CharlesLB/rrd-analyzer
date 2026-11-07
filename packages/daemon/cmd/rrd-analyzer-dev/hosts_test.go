package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAllowLocalHostsLetsOnlyThisMachineBeNamed(t *testing.T) {
	tests := []struct {
		name       string
		giveListen string
		giveHost   string
		wantServed bool
		wantStatus int
	}{
		{name: "the loopback name", giveListen: "127.0.0.1:34115", giveHost: "localhost:34115", wantServed: true, wantStatus: http.StatusNoContent},
		{name: "the loopback address", giveListen: "127.0.0.1:34115", giveHost: "127.0.0.1:34115", wantServed: true, wantStatus: http.StatusNoContent},
		{name: "the IPv6 loopback", giveListen: "127.0.0.1:34115", giveHost: "[::1]:34115", wantServed: true, wantStatus: http.StatusNoContent},
		{name: "the loopback name in capitals, fully qualified", giveListen: "127.0.0.1:34115", giveHost: "LOCALHOST.:34115", wantServed: true, wantStatus: http.StatusNoContent},
		{name: "a host with no port", giveListen: "127.0.0.1:34115", giveHost: "localhost", wantServed: true, wantStatus: http.StatusNoContent},
		{name: "the address it was told to listen on", giveListen: "192.0.2.10:34115", giveHost: "192.0.2.10:34115", wantServed: true, wantStatus: http.StatusNoContent},
		{name: "a name somebody else pointed at this machine", giveListen: "127.0.0.1:34115", giveHost: "rebound.example.com:34115", wantServed: false, wantStatus: http.StatusForbidden},
		{name: "any host, on a server listening on every interface", giveListen: ":34115", giveHost: "rebound.example.com:34115", wantServed: false, wantStatus: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			served := false
			handler := allowLocalHosts(tt.giveListen, http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				served = true
				writer.WriteHeader(http.StatusNoContent)
			}))
			request := httptest.NewRequest(http.MethodGet, "/api/analyses", http.NoBody)
			request.Host = tt.giveHost
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if recorder.Code != tt.wantStatus || served != tt.wantServed {
				t.Errorf("status %d served %v, want %d served %v", recorder.Code, served, tt.wantStatus, tt.wantServed)
			}
		})
	}
}
