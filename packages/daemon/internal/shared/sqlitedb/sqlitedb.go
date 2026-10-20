// Package sqlitedb opens the SQLite file every store of the application keeps its rows in, the same
// way for each of them.
package sqlitedb

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// The driver is registered under "sqlite" by modernc.org/sqlite, which is a translation of
// SQLite into Go rather than a binding. That matters here: the Windows half of the release
// cross-compiles with CGO_ENABLED=0, which a C binding would not survive.
const driverName = "sqlite"

// Foreign keys are off by default in SQLite, and the sources of an analysis are only ever
// reached through it, so the cascade is what keeps a delete from leaving orphans behind. The
// busy timeout covers the window where a write is waiting on another store's connection to the
// same file, which WAL lets every reader go on past.
const connectionOptions = "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"

// Open hands back a handle on the database at path, creating the file when it is not there yet.
//
// The handle holds one connection at a time. The rows are written by a person clicking, not by
// traffic, and serialising removes every chance of a writer meeting a locked database.
func Open(path string) (*sql.DB, error) {
	handle, err := sql.Open(driverName, path+connectionOptions)
	if err != nil {
		return nil, fmt.Errorf("open database %q: %w", path, err)
	}

	handle.SetMaxOpenConns(1)

	return handle, nil
}
