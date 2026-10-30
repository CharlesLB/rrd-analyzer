// Package sqlitedb opens the SQLite file every store of the application keeps its rows in, the same
// way for each of them.
package sqlitedb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"modernc.org/sqlite"
)

// The driver is modernc.org/sqlite, which is a translation of SQLite into Go rather than a binding.
// That matters here: the Windows half of the release cross-compiles with CGO_ENABLED=0, which a C
// binding would not survive.
//
// Foreign keys are off by default in SQLite, and the sources of an analysis are only ever
// reached through it, so the cascade is what keeps a delete from leaving orphans behind. The
// busy timeout covers the window where a write is waiting on another store's connection to the
// same file, which WAL lets every reader go on past.
const connectionOptions = "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"

// Open hands back a handle on the database at path, creating the file when it is not there yet.
//
// The connector checks the query string of the name it is given before anything is opened, so a
// path holding a '?' of its own, which shifts the query string onto part of the path, is refused
// here rather than on the first statement.
//
// The handle holds one connection at a time. The rows are written by a person clicking, not by
// traffic, and serialising removes every chance of a writer meeting a locked database.
func Open(path string) (*sql.DB, error) {
	connector, err := sqlite.NewConnector(path + connectionOptions)
	if err != nil {
		return nil, fmt.Errorf("open database %q: %w", path, err)
	}

	handle := sql.OpenDB(connector)
	handle.SetMaxOpenConns(1)

	return handle, nil
}

// OpenWithSchema opens the database at path the way Open does and runs schema on it: the statements
// that create, when they are not there yet, the tables a store keeps its rows in. A schema that does
// not run, on a file that is not a database among others, closes the handle again.
func OpenWithSchema(callerContext context.Context, path string, schema string) (*sql.DB, error) {
	handle, err := Open(path)
	if err != nil {
		return nil, err
	}

	if _, err := handle.ExecContext(callerContext, schema); err != nil {
		return nil, errors.Join(fmt.Errorf("prepare database %q: %w", path, err), handle.Close())
	}

	return handle, nil
}
