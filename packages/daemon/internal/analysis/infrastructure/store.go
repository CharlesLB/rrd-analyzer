//go:build !js

package infrastructure

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/sqlitedb"
)

// Every statement the store runs. None is assembled from a value: what varies reaches SQLite as a
// bound parameter, except the version setUserVersion writes, which is a constant of this package.
const (
	// schema keeps writing chart_count, as the length of the canvas, so a database opened afterwards
	// by an earlier build of the application still reads.
	schema = `
CREATE TABLE IF NOT EXISTS analyses (
	id            TEXT    PRIMARY KEY,
	name          TEXT    NOT NULL,
	chart_count   INTEGER NOT NULL,
	canvas        TEXT    NOT NULL DEFAULT '[]',
	library_order TEXT    NOT NULL DEFAULT '[]',
	series_colors TEXT    NOT NULL DEFAULT '[]',
	created_at    INTEGER NOT NULL,
	last_accessed INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_sources (
	analysis_id TEXT    NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
	position    INTEGER NOT NULL,
	name        TEXT    NOT NULL,
	path        TEXT    NOT NULL,
	size        INTEGER NOT NULL,
	PRIMARY KEY (analysis_id, position)
);
`
	countAnalysesColumn   = `SELECT COUNT(*) FROM pragma_table_info('analyses') WHERE name = ?`
	addCanvasColumn       = `ALTER TABLE analyses ADD COLUMN canvas TEXT NOT NULL DEFAULT '[]'`
	addLibraryOrderColumn = `ALTER TABLE analyses ADD COLUMN library_order TEXT NOT NULL DEFAULT '[]'`
	addSeriesColorsColumn = `ALTER TABLE analyses ADD COLUMN series_colors TEXT NOT NULL DEFAULT '[]'`

	readUserVersion = `PRAGMA user_version`
	setUserVersion  = `PRAGMA user_version = %d`
	countAnalyses   = `SELECT COUNT(*) FROM analyses`

	// selectAnalyses reads the columns scanAnalysis expects, in its order, for List and Get alike.
	selectAnalyses = `SELECT id, name, canvas, library_order, series_colors, created_at, last_accessed FROM analyses`

	// listAnalyses puts the analysis opened most recently first: each row of the library says when
	// it was last opened, and the one a person comes back for is nearly always the one they just
	// left. Two opened at the same instant, which is what a library imported whole can be, stay in
	// the order they were created in.
	listAnalyses = selectAnalyses + ` ORDER BY last_accessed DESC, rowid`
	getAnalysis  = selectAnalyses + ` WHERE id = ?`

	// selectSources reads the columns scanSources expects, in its order.
	selectSources         = `SELECT analysis_id, name, path, size FROM analysis_sources`
	listSources           = selectSources + ` ORDER BY analysis_id, position`
	listSourcesOfAnalysis = selectSources + ` WHERE analysis_id = ? ORDER BY position`

	touchAnalysis    = `UPDATE analyses SET last_accessed = ? WHERE id = ?`
	renameAnalysis   = `UPDATE analyses SET name = ? WHERE id = ?`
	saveCanvas       = `UPDATE analyses SET canvas = ?, chart_count = ? WHERE id = ?`
	saveLibraryOrder = `UPDATE analyses SET library_order = ? WHERE id = ?`
	saveSeriesColors = `UPDATE analyses SET series_colors = ? WHERE id = ?`
	upsertAnalysis   = `INSERT INTO analyses (id, name, chart_count, canvas, library_order, series_colors, created_at, last_accessed)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET name = excluded.name, chart_count = excluded.chart_count, canvas = excluded.canvas,
			                               library_order = excluded.library_order, series_colors = excluded.series_colors,
			                               last_accessed = excluded.last_accessed`
	deleteSourcesOfAnalysis = `DELETE FROM analysis_sources WHERE analysis_id = ?`
	insertSource            = `INSERT INTO analysis_sources (analysis_id, position, name, path, size) VALUES (?, ?, ?, ?, ?)`
	countAnalysesWithID     = `SELECT COUNT(*) FROM analyses WHERE id = ?`
	deleteAnalysis          = `DELETE FROM analyses WHERE id = ?`
)

type Store struct {
	handle *sql.DB
}

// OpenStore prepares the database the library lives in, creating it when it is not there yet.
// A brand new installation therefore opens on an empty library rather than on anything seeded.
func OpenStore(callerContext context.Context, path string, legacyPath string) (*Store, error) {
	handle, err := sqlitedb.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open analyses database: %w", err)
	}

	store := &Store{handle: handle}
	if err := store.prepare(callerContext, path, legacyPath); err != nil {
		return nil, errors.Join(err, handle.Close())
	}

	return store, nil
}

func (store *Store) Close() error {
	return store.handle.Close()
}

func (store *Store) List(callerContext context.Context) ([]analysisDomain.Analysis, error) {
	rows, err := store.handle.QueryContext(callerContext, listAnalyses)
	if err != nil {
		return nil, fmt.Errorf("list analyses: %w", err)
	}
	defer rows.Close()

	stored := []analysisDomain.Analysis{}
	for rows.Next() {
		analysis, err := scanAnalysis(rows)
		if err != nil {
			return nil, err
		}

		stored = append(stored, analysis)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read analyses: %w", err)
	}

	return store.withSources(callerContext, stored)
}

func (store *Store) Get(callerContext context.Context, analysisID string) (analysisDomain.Analysis, error) {
	row := store.handle.QueryRowContext(callerContext, getAnalysis, analysisID)

	analysis, err := scanAnalysis(row)
	if errors.Is(err, sql.ErrNoRows) {
		return analysisDomain.Analysis{}, fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
	}
	if err != nil {
		return analysisDomain.Analysis{}, err
	}

	rows, err := store.handle.QueryContext(callerContext, listSourcesOfAnalysis, analysisID)
	if err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("list sources of %q: %w", analysisID, err)
	}
	defer rows.Close()

	byAnalysis, err := scanSources(rows)
	if err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("sources of %q: %w", analysisID, err)
	}

	analysis.Files = byAnalysis[analysisID]

	return analysis, nil
}

func (store *Store) Touch(callerContext context.Context, analysisID string, accessed time.Time) error {
	result, err := store.handle.ExecContext(callerContext, touchAnalysis, accessed.UnixMilli(), analysisID)
	if err != nil {
		return fmt.Errorf("touch analysis %q: %w", analysisID, err)
	}

	return updatedOne(result, analysisID)
}

func (store *Store) Rename(callerContext context.Context, analysisID string, name string) error {
	result, err := store.handle.ExecContext(callerContext, renameAnalysis, name, analysisID)
	if err != nil {
		return fmt.Errorf("rename analysis %q: %w", analysisID, err)
	}

	return updatedOne(result, analysisID)
}

func (store *Store) SaveCanvas(callerContext context.Context, analysisID string, canvas []analysisDomain.CanvasChart) error {
	result, err := store.handle.ExecContext(callerContext, saveCanvas, encodedList(chartsOrEmpty(canvas)), len(canvas), analysisID)
	if err != nil {
		return fmt.Errorf("save the canvas of %q: %w", analysisID, err)
	}

	return updatedOne(result, analysisID)
}

func (store *Store) SaveLibraryOrder(callerContext context.Context, analysisID string, order []analysisDomain.ChartReference) error {
	result, err := store.handle.ExecContext(callerContext, saveLibraryOrder, encodedList(referencesOrEmpty(order)), analysisID)
	if err != nil {
		return fmt.Errorf("save the library order of %q: %w", analysisID, err)
	}

	return updatedOne(result, analysisID)
}

func (store *Store) SaveSeriesColors(callerContext context.Context, analysisID string, colors []analysisDomain.SeriesColor) error {
	result, err := store.handle.ExecContext(callerContext, saveSeriesColors, encodedList(colorsOrEmpty(colors)), analysisID)
	if err != nil {
		return fmt.Errorf("save the series colors of %q: %w", analysisID, err)
	}

	return updatedOne(result, analysisID)
}

// encodedList is the JSON text a list column holds. Its items are structs of strings, integers and
// slices of those, which json.Marshal encodes without fail, so the error it returns is always nil;
// the type set is what keeps a list that could fail to encode from being passed in.
func encodedList[Item analysisDomain.CanvasChart | analysisDomain.ChartReference | analysisDomain.SeriesColor](list []Item) string {
	encoded, _ := json.Marshal(list)

	return string(encoded)
}

// updatedOne turns an update that matched no row into the not-found error the service reports.
func updatedOne(result sql.Result, analysisID string) error {
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("count rows updated for %q: %w", analysisID, err)
	}

	if updated == 0 {
		return fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
	}

	return nil
}

func (store *Store) Save(callerContext context.Context, analysis analysisDomain.Analysis) error {
	canvas := encodedList(chartsOrEmpty(analysis.Canvas))
	libraryOrder := encodedList(referencesOrEmpty(analysis.LibraryOrder))
	seriesColors := encodedList(colorsOrEmpty(analysis.SeriesColors))

	return store.inTransaction(callerContext, func(transaction *sql.Tx) error {
		_, err := transaction.ExecContext(callerContext, upsertAnalysis,
			analysis.ID, analysis.Name, len(analysis.Canvas), canvas, libraryOrder, seriesColors,
			analysis.CreatedAt.UnixMilli(), analysis.LastAccessed.UnixMilli())
		if err != nil {
			return fmt.Errorf("save analysis %q: %w", analysis.ID, err)
		}

		if _, err := transaction.ExecContext(callerContext, deleteSourcesOfAnalysis, analysis.ID); err != nil {
			return fmt.Errorf("replace sources of %q: %w", analysis.ID, err)
		}

		for position, file := range analysis.Files {
			_, err := transaction.ExecContext(callerContext, insertSource, analysis.ID, position, file.Name, file.Path, file.Size)
			if err != nil {
				return fmt.Errorf("save source %q of %q: %w", file.Name, analysis.ID, err)
			}
		}

		return nil
	})
}

// AddSources appends files after the sources an analysis already lists, in one transaction, so the
// series read from the files it had keep their positions and the canvas keeps pointing at them.
//
// The sources already listed are read inside that same transaction and a file among them is left
// out, so the caller's own check of what is new cannot be overtaken: of two requests adding one file
// at once, the second finds it listed and adds nothing.
func (store *Store) AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) ([]analysisDomain.SourceFile, error) {
	var added []analysisDomain.SourceFile

	err := store.inTransaction(callerContext, func(transaction *sql.Tx) error {
		var analyses int
		if err := transaction.QueryRowContext(callerContext, countAnalysesWithID, analysisID).Scan(&analyses); err != nil {
			return fmt.Errorf("find analysis %q: %w", analysisID, err)
		}

		if analyses == 0 {
			return fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
		}

		listed, err := sourcesListedIn(callerContext, transaction, analysisID)
		if err != nil {
			return err
		}

		added = analysisDomain.SourcesNotListed(listed, files)

		for offset, file := range added {
			_, err := transaction.ExecContext(callerContext, insertSource, analysisID, len(listed)+offset, file.Name, file.Path, file.Size)
			if err != nil {
				return fmt.Errorf("add source %q to %q: %w", file.Name, analysisID, err)
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return added, nil
}

func sourcesListedIn(callerContext context.Context, transaction *sql.Tx, analysisID string) ([]analysisDomain.SourceFile, error) {
	rows, err := transaction.QueryContext(callerContext, listSourcesOfAnalysis, analysisID)
	if err != nil {
		return nil, fmt.Errorf("list sources of %q: %w", analysisID, err)
	}
	defer rows.Close()

	byAnalysis, err := scanSources(rows)
	if err != nil {
		return nil, fmt.Errorf("sources of %q: %w", analysisID, err)
	}

	return byAnalysis[analysisID], nil
}

func (store *Store) Delete(callerContext context.Context, analysisID string) error {
	result, err := store.handle.ExecContext(callerContext, deleteAnalysis, analysisID)
	if err != nil {
		return fmt.Errorf("delete analysis %q: %w", analysisID, err)
	}

	return updatedOne(result, analysisID)
}

func (store *Store) withSources(callerContext context.Context, stored []analysisDomain.Analysis) ([]analysisDomain.Analysis, error) {
	if len(stored) == 0 {
		return stored, nil
	}

	rows, err := store.handle.QueryContext(callerContext, listSources)
	if err != nil {
		return nil, fmt.Errorf("list analysis sources: %w", err)
	}
	defer rows.Close()

	byAnalysis, err := scanSources(rows)
	if err != nil {
		return nil, err
	}

	for index := range stored {
		stored[index].Files = byAnalysis[stored[index].ID]
	}

	return stored, nil
}

// scanSources reads rows of selectSources into each analysis' sources, in the order the rows came.
func scanSources(rows *sql.Rows) (map[string][]analysisDomain.SourceFile, error) {
	byAnalysis := map[string][]analysisDomain.SourceFile{}
	for rows.Next() {
		var analysisID string
		var file analysisDomain.SourceFile
		if err := rows.Scan(&analysisID, &file.Name, &file.Path, &file.Size); err != nil {
			return nil, fmt.Errorf("read analysis source: %w", err)
		}

		byAnalysis[analysisID] = append(byAnalysis[analysisID], file)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read analysis sources: %w", err)
	}

	return byAnalysis, nil
}

func (store *Store) inTransaction(callerContext context.Context, act func(*sql.Tx) error) error {
	transaction, err := store.handle.BeginTx(callerContext, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	if err := act(transaction); err != nil {
		_ = transaction.Rollback()

		return err
	}

	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}

// rowScanner is what a single row and a result set have in common.
type rowScanner interface {
	Scan(destinations ...any) error
}

func scanAnalysis(row rowScanner) (analysisDomain.Analysis, error) {
	var analysis analysisDomain.Analysis
	var canvas, libraryOrder, seriesColors string
	var createdAt, lastAccessed int64

	if err := row.Scan(&analysis.ID, &analysis.Name, &canvas, &libraryOrder, &seriesColors, &createdAt, &lastAccessed); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("read analysis: %w", err)
	}

	if err := json.Unmarshal([]byte(canvas), &analysis.Canvas); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("decode the canvas of %q: %w", analysis.ID, err)
	}

	if err := json.Unmarshal([]byte(libraryOrder), &analysis.LibraryOrder); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("decode the library order of %q: %w", analysis.ID, err)
	}

	if err := json.Unmarshal([]byte(seriesColors), &analysis.SeriesColors); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("decode the series colors of %q: %w", analysis.ID, err)
	}

	analysis.Canvas = chartsOrEmpty(analysis.Canvas)
	analysis.LibraryOrder = referencesOrEmpty(analysis.LibraryOrder)
	analysis.SeriesColors = colorsOrEmpty(analysis.SeriesColors)
	analysis.CreatedAt = time.UnixMilli(createdAt)
	analysis.LastAccessed = time.UnixMilli(lastAccessed)

	return analysis, nil
}
