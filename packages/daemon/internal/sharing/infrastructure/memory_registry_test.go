package infrastructure_test

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
)

func TestMemoryRegistry_ACallerThatGaveUp_FailsEveryCall(t *testing.T) {
	registry := sharingInfra.NewMemoryRegistry()
	callerContext, cancel := context.WithCancel(context.Background())
	cancel()

	tests := []struct {
		name     string
		giveCall func() error
	}{
		{name: "list", giveCall: func() error {
			_, err := registry.List(callerContext)

			return err
		}},
		{name: "get", giveCall: func() error {
			_, err := registry.Get(callerContext, "cpu")

			return err
		}},
		{name: "save", giveCall: func() error { return registry.Save(callerContext, domain.OwnedSession{AnalysisID: "cpu"}) }},
		{name: "renew", giveCall: func() error { return registry.Renew(callerContext, "cpu", domain.Revision{}) }},
		{name: "forget", giveCall: func() error { return registry.Forget(callerContext, "cpu") }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.giveCall(); !errors.Is(err, context.Canceled) {
				t.Errorf("err = %v, want %v", err, context.Canceled)
			}
		})
	}
}

func TestMemoryRegistry_ASessionSavedOrHandedBack_IsACopy(t *testing.T) {
	registry := sharingInfra.NewMemoryRegistry()
	session := domain.OwnedSession{
		AnalysisID: "cpu",
		Key:        []byte("key"),
		Files:      []domain.OnlineFile{{FileID: "file-1"}},
		Log:        &domain.OnlineLog{Name: "service.ndjson"},
	}

	if err := registry.Save(context.Background(), session); err != nil {
		t.Fatalf("save: %v", err)
	}

	session.Key[0], session.Files[0].FileID, session.Log.Name = 'X', "changed", "changed"

	handed, err := registry.Get(context.Background(), "cpu")
	if err != nil {
		t.Fatalf("get: %v", err)
	}

	handed.Key[1], handed.Files[0].Name, handed.Log.FileID = 'Y', "changed", "changed"

	kept, _ := registry.Get(context.Background(), "cpu")
	if string(kept.Key) != "key" || kept.Files[0].FileID != "file-1" || kept.Files[0].Name != "" || kept.Log.Name != "service.ndjson" || kept.Log.FileID != "" {
		t.Errorf("kept = %+v, want the session as it was saved", kept)
	}
}

func TestSystemEntropy_FillsTheBuffer(t *testing.T) {
	buffer := make([]byte, 32)

	sharingInfra.SystemEntropy{}.Fill(buffer)

	if bytes.Equal(buffer, make([]byte, 32)) {
		t.Error("the buffer is still all zeros, want it filled with random bytes")
	}
}
