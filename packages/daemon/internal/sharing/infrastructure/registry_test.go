//go:build !js

package infrastructure_test

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
)

const databaseFileName = "analyses.db"

// publishedAt is in the local zone, which is the zone the store reads an instant back in.
var publishedAt = time.UnixMilli(time.Date(2026, time.March, 12, 9, 30, 0, 0, time.UTC).UnixMilli())

func ownedSession(analysisID string) domain.OwnedSession {
	return domain.OwnedSession{
		AnalysisID: analysisID,
		SessionID:  "session-of-" + analysisID,
		OwnerToken: "token-of-" + analysisID,
		Key:        []byte("thirty-two bytes of key material"),
		Revision:   3,
		ExpiresAt:  publishedAt,
		Files:      []domain.OnlineFile{{Identity: "/srv/cpu.rrd", Blob: domain.Blob{FileID: "file-1", Name: "cpu.rrd", Size: 10, ChunkCount: 1}}},
		Log:        &domain.OnlineLog{Blob: domain.Blob{FileID: "file-2", Name: "service.ndjson", Size: 4, ChunkCount: 1}, Digest: "abcd"},
	}
}

func sqliteRegistry(t *testing.T) domain.Registry {
	t.Helper()

	store, err := sharingInfra.OpenStore(context.Background(), filepath.Join(t.TempDir(), databaseFileName))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	t.Cleanup(func() { _ = store.Close() })

	return store
}

func memoryRegistry(*testing.T) domain.Registry {
	return sharingInfra.NewMemoryRegistry()
}

var registries = []struct {
	name string
	open func(t *testing.T) domain.Registry
}{
	{name: "sqlite", open: sqliteRegistry},
	{name: "memory", open: memoryRegistry},
}

func save(t *testing.T, registry domain.Registry, sessions ...domain.OwnedSession) {
	t.Helper()

	for _, session := range sessions {
		if err := registry.Save(context.Background(), session); err != nil {
			t.Fatalf("save %q: %v", session.AnalysisID, err)
		}
	}
}

func TestRegistry_KeepsEachSessionWholeUntilItIsForgotten(t *testing.T) {
	for _, registry := range registries {
		t.Run(registry.name, func(t *testing.T) {
			kept := registry.open(t)
			withoutLog := ownedSession("memory")
			withoutLog.Log = nil
			save(t, kept, ownedSession("cpu"), withoutLog)

			replaced := ownedSession("cpu")
			replaced.Files = append(replaced.Files, domain.OnlineFile{Identity: "/srv/disk.rrd", Blob: domain.Blob{FileID: "file-3", Name: "disk.rrd", Size: 5, ChunkCount: 1}})
			save(t, kept, replaced)

			listed, err := kept.List(context.Background())
			if err != nil || !reflect.DeepEqual(listed, []domain.OwnedSession{replaced, withoutLog}) {
				t.Fatalf("list = %+v, %v; want both sessions in the order first saved, the first replaced", listed, err)
			}

			if err := kept.Forget(context.Background(), "cpu", replaced.SessionID); err != nil {
				t.Fatalf("forget: %v", err)
			}

			if _, err := kept.Get(context.Background(), "cpu"); !errors.Is(err, domain.ErrNotLive) {
				t.Errorf("get after forget = %v, want %v", err, domain.ErrNotLive)
			}
		})
	}
}

func TestRegistry_Renew_MovesOnlyWhereTheSessionStands(t *testing.T) {
	for _, registry := range registries {
		t.Run(registry.name, func(t *testing.T) {
			kept := registry.open(t)
			save(t, kept, ownedSession("cpu"))
			renewed := domain.Revision{Number: 7, ExpiresAt: publishedAt.Add(time.Hour)}

			if err := kept.Renew(context.Background(), "cpu", ownedSession("cpu").SessionID, renewed); err != nil {
				t.Fatalf("renew: %v", err)
			}

			if err := kept.Renew(context.Background(), "never live", "session-of-never live", renewed); err != nil {
				t.Fatalf("renew a session never saved: %v", err)
			}

			session, err := kept.Get(context.Background(), "cpu")
			want := ownedSession("cpu")
			want.Revision, want.ExpiresAt = renewed.Number, renewed.ExpiresAt

			if err != nil || !reflect.DeepEqual(session, want) {
				t.Errorf("get = %+v, %v; want %+v", session, err, want)
			}
		})
	}
}

func TestRegistry_AnAnalysisLiveAgainUnderAnotherSession_IsNeitherRenewedNorForgottenForTheOldOne(t *testing.T) {
	for _, registry := range registries {
		t.Run(registry.name, func(t *testing.T) {
			kept := registry.open(t)
			replacement := ownedSession("cpu")
			replacement.SessionID = "session started in place of the ended one"
			save(t, kept, replacement)
			ended := ownedSession("cpu").SessionID

			if err := kept.Renew(context.Background(), "cpu", ended, domain.Revision{Number: 9, ExpiresAt: publishedAt.Add(time.Hour)}); err != nil {
				t.Fatalf("renew the ended session: %v", err)
			}

			if err := kept.Forget(context.Background(), "cpu", ended); err != nil {
				t.Fatalf("forget the ended session: %v", err)
			}

			if session, err := kept.Get(context.Background(), "cpu"); err != nil || !reflect.DeepEqual(session, replacement) {
				t.Errorf("get = %+v, %v; want the replacement as it was saved", session, err)
			}
		})
	}
}
