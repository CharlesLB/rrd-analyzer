//go:build !js

package infrastructure

import (
	"context"
	"fmt"
)

const (
	canvasColumn       = "canvas"
	libraryOrderColumn = "library_order"
	seriesColorsColumn = "series_colors"
)

// prepare brings the database to the current schema and, the first time, brings in the library an
// earlier version kept elsewhere.
func (store *Store) prepare(callerContext context.Context, path string, legacyPath string) error {
	if _, err := store.handle.ExecContext(callerContext, schema); err != nil {
		return fmt.Errorf("prepare analyses database %q: %w", path, err)
	}

	if err := store.addColumnToAnEarlierLibrary(callerContext, canvasColumn, addCanvasColumn); err != nil {
		return err
	}

	if err := store.addColumnToAnEarlierLibrary(callerContext, libraryOrderColumn, addLibraryOrderColumn); err != nil {
		return err
	}

	if err := store.addColumnToAnEarlierLibrary(callerContext, seriesColorsColumn, addSeriesColorsColumn); err != nil {
		return err
	}

	return store.importLegacy(callerContext, legacyPath)
}

// addColumnToAnEarlierLibrary gives a database written before a column existed that column. Every
// analysis in it takes the column's default, which is what it had shown: an empty canvas, the chart
// library in the order the sources hold the series in, and every series in its default color.
func (store *Store) addColumnToAnEarlierLibrary(callerContext context.Context, column string, addition string) error {
	var matchingColumns int
	if err := store.handle.QueryRowContext(callerContext, countAnalysesColumn, column).Scan(&matchingColumns); err != nil {
		return fmt.Errorf("inspect the analyses table: %w", err)
	}

	if matchingColumns > 0 {
		return nil
	}

	if _, err := store.handle.ExecContext(callerContext, addition); err != nil {
		return fmt.Errorf("add the %s column: %w", column, err)
	}

	return nil
}
