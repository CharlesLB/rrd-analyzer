//go:build !js

package infrastructure_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

const readOnlyFileMode = 0o444

func legacyLibraryFile(t *testing.T) string {
	t.Helper()

	encoded, err := json.Marshal([]analysisDomain.Analysis{analysisFixture("a1", "from json")})
	if err != nil {
		t.Fatalf("encode legacy library: %v", err)
	}

	legacyPath := filepath.Join(t.TempDir(), "analyses.json")
	if err := os.WriteFile(legacyPath, encoded, 0o600); err != nil {
		t.Fatalf("write legacy library: %v", err)
	}

	return legacyPath
}

func TestOpenStore_ALegacyLibraryTheDatabaseCannotTakeIn_IsRefused(t *testing.T) {
	tests := []struct {
		name        string
		giveSchema  string
		wantMessage string
	}{
		{
			name:        "analyses that refuse to be written",
			giveSchema:  writtenAnalyses + `CREATE VIEW analyses AS SELECT * FROM written_analyses;`,
			wantMessage: "import legacy analysis",
		},
		{
			name:        "analyses that cannot be counted",
			giveSchema:  writtenAnalyses + `CREATE VIEW analyses AS SELECT * FROM written_analyses WHERE json_extract('{', '$');`,
			wantMessage: "count stored analyses",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := analysisInfra.OpenStore(context.Background(), databaseWritten(t, tt.giveSchema), legacyLibraryFile(t))

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Fatalf("err = %v, want one saying %q", err, tt.wantMessage)
			}
		})
	}
}

func TestOpenStore_AReadOnlyLibraryOfferedTheLegacyOne_ReportsTheOfferUnrecorded(t *testing.T) {
	store, databasePath := storeKeepingAnAnalysis(t)
	if err := store.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	if err := os.Chmod(databasePath, readOnlyFileMode); err != nil {
		t.Fatalf("make the library read-only: %v", err)
	}

	_, err := analysisInfra.OpenStore(context.Background(), databasePath, legacyLibraryFile(t))

	if err == nil || !strings.Contains(err.Error(), "record the legacy import") {
		t.Fatalf("err = %v, want the offer of the legacy library left unrecorded", err)
	}
}

func TestOpenStore_ALegacyPathNothingIsAt_OpensOnAnEmptyLibrary(t *testing.T) {
	directory := t.TempDir()

	store, err := analysisInfra.OpenStore(context.Background(), filepath.Join(directory, "analyses.db"), filepath.Join(directory, "analyses.json"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	t.Cleanup(func() { _ = store.Close() })

	if stored, err := store.List(context.Background()); err != nil || len(stored) != 0 {
		t.Fatalf("stored = %d analyses (%v), want an empty library", len(stored), err)
	}
}
