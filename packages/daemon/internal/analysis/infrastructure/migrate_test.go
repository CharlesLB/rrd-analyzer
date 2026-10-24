//go:build !js

package infrastructure_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

// databaseWritten is a database file holding what statements wrote, before any store opened it.
func databaseWritten(t *testing.T, statements string) string {
	t.Helper()

	databasePath := filepath.Join(t.TempDir(), "analyses.db")
	reshape(t, databasePath, statements)

	return databasePath
}

// writtenAnalyses is the table the views below read from: every column the library has ever kept.
const writtenAnalyses = `CREATE TABLE written_analyses (
	id TEXT, name TEXT, chart_count INTEGER, canvas TEXT, library_order TEXT, series_colors TEXT, created_at INTEGER, last_accessed INTEGER
);`

func TestOpenStore_AFileThatIsNotADatabase_IsRefused(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "analyses.db")
	if err := os.WriteFile(databasePath, []byte(strings.Repeat("a library kept as text, not as a database. ", 8)), 0o600); err != nil {
		t.Fatalf("write the file: %v", err)
	}

	_, err := analysisInfra.OpenStore(context.Background(), databasePath, "")

	if err == nil || !strings.Contains(err.Error(), "prepare analyses database") {
		t.Fatalf("err = %v, want the schema refused", err)
	}
}

func TestOpenStore_AnAnalysesViewItCannotBringToTheCurrentSchema_IsRefused(t *testing.T) {
	tests := []struct {
		name        string
		giveSchema  string
		wantMessage string
	}{
		{
			name:        "a view over a table that is gone",
			giveSchema:  writtenAnalyses + `CREATE VIEW analyses AS SELECT * FROM written_analyses; DROP TABLE written_analyses;`,
			wantMessage: "inspect the analyses table",
		},
		{
			name:        "a view without the canvas",
			giveSchema:  writtenAnalyses + `CREATE VIEW analyses AS SELECT id, name, chart_count, created_at, last_accessed FROM written_analyses;`,
			wantMessage: "add the canvas column",
		},
		{
			name:        "a view without the library order",
			giveSchema:  writtenAnalyses + `CREATE VIEW analyses AS SELECT id, name, chart_count, canvas, created_at, last_accessed FROM written_analyses;`,
			wantMessage: "add the library_order column",
		},
		{
			name:        "a view without the series colors",
			giveSchema:  writtenAnalyses + `CREATE VIEW analyses AS SELECT id, name, chart_count, canvas, library_order, created_at, last_accessed FROM written_analyses;`,
			wantMessage: "add the series_colors column",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := analysisInfra.OpenStore(context.Background(), databaseWritten(t, tt.giveSchema), "")

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Fatalf("err = %v, want one saying %q", err, tt.wantMessage)
			}
		})
	}
}
