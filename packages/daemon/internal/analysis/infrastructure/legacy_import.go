//go:build !js

package infrastructure

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
)

// legacyImportedVersion is the user_version a database carries once the library an earlier version
// kept as JSON has been offered to it, so the offer is made once and not again after a person
// deletes every analysis.
const legacyImportedVersion = 1

// importLegacy carries a library written by the previous version into an empty database, once:
// the database records that the offer was made, so deleting every analysis later does not bring
// the old library back. The json file is left where it is: it costs nothing and it is the only way
// back. A file that cannot be read or decoded is passed over rather than keeping the application
// from starting on every launch.
func (store *Store) importLegacy(callerContext context.Context, legacyPath string) error {
	if legacyPath == "" {
		return nil
	}

	var version int
	if err := store.handle.QueryRowContext(callerContext, readUserVersion).Scan(&version); err != nil {
		return fmt.Errorf("read the library version: %w", err)
	}

	if version >= legacyImportedVersion {
		return nil
	}

	if err := store.importLegacyFile(callerContext, legacyPath); err != nil {
		return err
	}

	if _, err := store.handle.ExecContext(callerContext, fmt.Sprintf(setUserVersion, legacyImportedVersion)); err != nil {
		return fmt.Errorf("record the legacy import: %w", err)
	}

	return nil
}

func (store *Store) importLegacyFile(callerContext context.Context, legacyPath string) error {
	populated, err := store.isPopulated(callerContext)
	if err != nil || populated {
		return err
	}

	for _, analysis := range legacyLibraryIn(legacyPath) {
		if err := store.Save(callerContext, analysis); err != nil {
			return fmt.Errorf("import legacy analysis %q: %w", analysis.ID, err)
		}
	}

	return nil
}

// legacyLibraryIn is the library the json file holds, or none when it is missing, unreadable or not
// a library.
func legacyLibraryIn(legacyPath string) []analysisDomain.Analysis {
	content, err := os.ReadFile(legacyPath)
	if err != nil {
		return nil
	}

	var legacy []analysisDomain.Analysis
	if json.Unmarshal(content, &legacy) != nil {
		return nil
	}

	return legacy
}

func (store *Store) isPopulated(callerContext context.Context) (bool, error) {
	var count int
	if err := store.handle.QueryRowContext(callerContext, countAnalyses).Scan(&count); err != nil {
		return false, fmt.Errorf("count stored analyses: %w", err)
	}

	return count > 0, nil
}
