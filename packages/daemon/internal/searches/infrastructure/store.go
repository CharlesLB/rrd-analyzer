//go:build !js

// Package infrastructure persists the search history in the same SQLite file as the library.
package infrastructure

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/sqlitedb"
)

// Every statement the store runs. What varies reaches SQLite as a bound parameter.
const (
	// schema compares terms without letter case, so "CPU" typed after "cpu" takes its place
	// rather than standing beside it. The sequence orders a field's terms by when they were last
	// remembered; a counter rather than a clock, so two remembered in the same instant still keep
	// the order they arrived in.
	schema = `
CREATE TABLE IF NOT EXISTS search_history (
	field    TEXT    NOT NULL,
	term     TEXT    NOT NULL COLLATE NOCASE,
	sequence INTEGER NOT NULL,
	PRIMARY KEY (field, term)
);
`
	listTerms    = `SELECT term FROM search_history WHERE field = ? ORDER BY sequence DESC`
	rememberTerm = `INSERT INTO search_history (field, term, sequence)
			 VALUES (?, ?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM search_history))
			 ON CONFLICT(field, term) DO UPDATE SET term = excluded.term, sequence = excluded.sequence`
	trimTerms = `DELETE FROM search_history WHERE field = ? AND sequence NOT IN
			 (SELECT sequence FROM search_history WHERE field = ? ORDER BY sequence DESC LIMIT ?)`
	forgetTerm     = `DELETE FROM search_history WHERE field = ? AND term = ?`
	deleteAllTerms = `DELETE FROM search_history`
)

type Store struct {
	handle *sql.DB
}

// OpenStore prepares the search history in the database at path, beside whatever else the file
// already holds.
func OpenStore(callerContext context.Context, path string) (*Store, error) {
	handle, err := sqlitedb.OpenWithSchema(callerContext, path, schema)
	if err != nil {
		return nil, fmt.Errorf("open search history database: %w", err)
	}

	return &Store{handle: handle}, nil
}

func (store *Store) Close() error {
	return store.handle.Close()
}

func (store *Store) Terms(callerContext context.Context, field string) ([]string, error) {
	rows, err := store.handle.QueryContext(callerContext, listTerms, field)
	if err != nil {
		return nil, fmt.Errorf("list search terms: %w", err)
	}
	defer rows.Close()

	terms := []string{}
	for rows.Next() {
		var term string
		if err := rows.Scan(&term); err != nil {
			return nil, fmt.Errorf("scan search term: %w", err)
		}

		terms = append(terms, term)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read search terms: %w", err)
	}

	return terms, nil
}

func (store *Store) Remember(callerContext context.Context, field string, term string, keep int) error {
	transaction, err := store.handle.BeginTx(callerContext, nil)
	if err != nil {
		return fmt.Errorf("begin remembering a search: %w", err)
	}

	if _, err := transaction.ExecContext(callerContext, rememberTerm, field, term); err != nil {
		return errors.Join(fmt.Errorf("remember search term: %w", err), transaction.Rollback())
	}

	if _, err := transaction.ExecContext(callerContext, trimTerms, field, field, keep); err != nil {
		return errors.Join(fmt.Errorf("trim search history: %w", err), transaction.Rollback())
	}

	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit a remembered search: %w", err)
	}

	return nil
}

func (store *Store) Forget(callerContext context.Context, field string, term string) error {
	if _, err := store.handle.ExecContext(callerContext, forgetTerm, field, term); err != nil {
		return fmt.Errorf("forget search term: %w", err)
	}

	return nil
}

func (store *Store) DeleteAll(callerContext context.Context) error {
	if _, err := store.handle.ExecContext(callerContext, deleteAllTerms); err != nil {
		return fmt.Errorf("delete search history: %w", err)
	}

	return nil
}
