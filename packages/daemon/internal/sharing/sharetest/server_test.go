package sharetest_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
)

func TestServer_ABlobReadThatDoesNotNameTheProtocol_IsRefusedLikeTheWorkerRefusesIt(t *testing.T) {
	server := sharetest.Started(t)

	created, err := http.Post(server.URL()+"/api/sessions", "", nil)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	defer created.Body.Close()

	var session struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(created.Body).Decode(&session); err != nil {
		t.Fatalf("read the created session: %v", err)
	}

	tests := []struct {
		name string
		give string
	}{
		{name: "the state", give: "/state"},
		{name: "a chunk", give: "/files/AAAAAAAAAAAAAAAAAAAAAA/chunks/0"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response, err := http.Get(server.URL() + "/api/sessions/" + session.SessionID + tt.give)
			if err != nil {
				t.Fatalf("read: %v", err)
			}
			defer response.Body.Close()

			if response.StatusCode != http.StatusBadRequest {
				t.Errorf("status = %d, want 400 for a read that does not name the protocol", response.StatusCode)
			}
		})
	}
}
