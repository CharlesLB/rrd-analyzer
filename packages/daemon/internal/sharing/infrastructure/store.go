//go:build !js

package infrastructure

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/sqlitedb"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

// Every statement the store runs. What varies reaches SQLite as a bound parameter.
const (
	// schema keeps one row per live analysis. The files online and the log are JSON, since they are
	// only ever read and written whole, with the session. The owner token and the key sit in the
	// same file as the library they publish, readable by the same person; both are worthless once
	// the session ends, an hour after its last activity.
	schema = `
CREATE TABLE IF NOT EXISTS live_sessions (
	analysis_id TEXT    PRIMARY KEY,
	session_id  TEXT    NOT NULL,
	owner_token TEXT    NOT NULL,
	session_key BLOB    NOT NULL,
	revision    INTEGER NOT NULL,
	expires_at  INTEGER NOT NULL,
	files       TEXT    NOT NULL,
	log         TEXT
);
`
	// selectSessions reads the columns scanSession expects, in its order.
	selectSessions = `SELECT analysis_id, session_id, owner_token, session_key, revision, expires_at, files, log FROM live_sessions`
	listSessions   = selectSessions + ` ORDER BY rowid`
	getSession     = selectSessions + ` WHERE analysis_id = ?`
	saveSession    = `INSERT INTO live_sessions (analysis_id, session_id, owner_token, session_key, revision, expires_at, files, log)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(analysis_id) DO UPDATE SET session_id = excluded.session_id, owner_token = excluded.owner_token,
			                                        session_key = excluded.session_key, revision = excluded.revision,
			                                        expires_at = excluded.expires_at, files = excluded.files, log = excluded.log`
	renewSession  = `UPDATE live_sessions SET revision = ?, expires_at = ? WHERE analysis_id = ? AND session_id = ?`
	forgetSession = `DELETE FROM live_sessions WHERE analysis_id = ? AND session_id = ?`
)

// Store keeps the live sessions this app owns in the SQLite file the library lives in, so a desktop
// app closed and opened again still knows which of its analyses are online.
type Store struct {
	handle *sql.DB
}

func OpenStore(callerContext context.Context, path string) (*Store, error) {
	handle, err := sqlitedb.OpenWithSchema(callerContext, path, schema)
	if err != nil {
		return nil, fmt.Errorf("open live sessions database: %w", err)
	}

	return &Store{handle: handle}, nil
}

func (store *Store) Close() error {
	return store.handle.Close()
}

func (store *Store) List(callerContext context.Context) ([]domain.OwnedSession, error) {
	rows, err := store.handle.QueryContext(callerContext, listSessions)
	if err != nil {
		return nil, fmt.Errorf("list live sessions: %w", err)
	}
	defer rows.Close()

	sessions := []domain.OwnedSession{}
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			return nil, err
		}

		sessions = append(sessions, session)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read live sessions: %w", err)
	}

	return sessions, nil
}

func (store *Store) Get(callerContext context.Context, analysisID string) (domain.OwnedSession, error) {
	session, err := scanSession(store.handle.QueryRowContext(callerContext, getSession, analysisID))
	if errors.Is(err, sql.ErrNoRows) {
		return domain.OwnedSession{}, domain.ErrNotLive
	}

	return session, err
}

// Save writes the whole session. json.Marshal cannot fail on the files or the log: both hold only
// strings and numbers.
func (store *Store) Save(callerContext context.Context, session domain.OwnedSession) error {
	files, _ := json.Marshal(session.Files)

	var log sql.NullString
	if session.Log != nil {
		encoded, _ := json.Marshal(session.Log)
		log = sql.NullString{String: string(encoded), Valid: true}
	}

	if _, err := store.handle.ExecContext(callerContext, saveSession,
		session.AnalysisID, session.SessionID, session.OwnerToken, session.Key, session.Revision, session.ExpiresAt.UnixMilli(), string(files), log,
	); err != nil {
		return fmt.Errorf("save live session: %w", err)
	}

	return nil
}

func (store *Store) Renew(callerContext context.Context, analysisID string, sessionID string, revision domain.Revision) error {
	if _, err := store.handle.ExecContext(callerContext, renewSession, revision.Number, revision.ExpiresAt.UnixMilli(), analysisID, sessionID); err != nil {
		return fmt.Errorf("renew live session: %w", err)
	}

	return nil
}

func (store *Store) Forget(callerContext context.Context, analysisID string, sessionID string) error {
	if _, err := store.handle.ExecContext(callerContext, forgetSession, analysisID, sessionID); err != nil {
		return fmt.Errorf("forget live session: %w", err)
	}

	return nil
}

type scanner interface {
	Scan(destinations ...any) error
}

func scanSession(row scanner) (domain.OwnedSession, error) {
	var (
		session   domain.OwnedSession
		expiresAt int64
		files     string
		log       sql.NullString
	)

	if err := row.Scan(&session.AnalysisID, &session.SessionID, &session.OwnerToken, &session.Key, &session.Revision, &expiresAt, &files, &log); err != nil {
		return domain.OwnedSession{}, fmt.Errorf("scan live session: %w", err)
	}

	session.ExpiresAt = time.UnixMilli(expiresAt)

	if err := json.Unmarshal([]byte(files), &session.Files); err != nil {
		return domain.OwnedSession{}, fmt.Errorf("read the files of the live session of %q: %w", session.AnalysisID, err)
	}

	if log.Valid {
		session.Log = &domain.OnlineLog{}
		if err := json.Unmarshal([]byte(log.String), session.Log); err != nil {
			return domain.OwnedSession{}, fmt.Errorf("read the log of the live session of %q: %w", session.AnalysisID, err)
		}
	}

	return session, nil
}
