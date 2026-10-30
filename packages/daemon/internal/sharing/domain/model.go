// Package domain is what a live session is: an analysis published, encrypted, to the share service
// for as long as someone keeps it active, the state every viewer rebuilds it from, and the ports the
// use cases reach the service, the library and the files through. docs/SHARING.md is the protocol.
package domain

import (
	"encoding/json"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
)

const (
	// KeyBytes is the length of a session's AES-256 key.
	KeyBytes = 32

	// ChunkBytes is how much of a file one sealed chunk carries. Eight mebibytes keeps every upload
	// far below the hundred megabytes a Cloudflare request may carry, and a file of a few hundred
	// megabytes still crosses in a few dozen requests.
	ChunkBytes = 8 << 20

	// StateFormat is the version of the state's JSON. A viewer refuses a state written in any other,
	// rather than rebuilding an analysis from fields it would misread.
	StateFormat = 1
)

// OwnedSession is a live session as the app that started it remembers it: where the service keeps
// it, the token that lets this app write to it, the key its blobs are sealed with, and which of the
// analysis' files are already online, so a publication uploads only what is new.
type OwnedSession struct {
	AnalysisID string
	SessionID  string
	OwnerToken string
	Key        []byte
	Revision   int64
	ExpiresAt  time.Time
	Files      []OnlineFile
	Log        *OnlineLog
}

// Blob is a file as the service holds it: the identifier its chunks are stored under, the name it
// had, how many bytes it holds and how many chunks they were cut into. The types that embed it keep
// its fields at their own level in JSON, which is how the state and the registry write them.
type Blob struct {
	FileID     string `json:"fileId"`
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	ChunkCount int    `json:"chunkCount"`
}

// OnlineFile is a source the session holds. Identity is the source's identity in the analysis
// (SourceFile.Identity), which is how a publication tells a file already online from a new one. It
// stands before the embedded blob, against the usual order, because that is where the registry's
// JSON has it.
type OnlineFile struct {
	Identity string `json:"identity"`
	Blob
}

// OnlineLog is the log the session holds. A log has no path, so it is recognised by its name and
// the SHA-256 of its content, written in hexadecimal.
type OnlineLog struct {
	Blob

	Digest string `json:"digest"`
}

// Credentials is what writing to a session takes.
type Credentials struct {
	SessionID  string
	OwnerToken string
}

// CreatedSession is the service's answer to a session being started.
type CreatedSession struct {
	Credentials Credentials
	ExpiresAt   time.Time
}

// Revision is where a session stands: how many states were published, and when it ends unless
// someone keeps it active.
type Revision struct {
	Number    int64
	ExpiresAt time.Time
}

// SealedState is a state as the service hands it back, still sealed, with where the session stands.
type SealedState struct {
	Sealed   []byte
	Revision Revision
}

// Arrangement is everything about an analysis a viewer takes from the owner's besides the files.
type Arrangement struct {
	Name         string
	Canvas       []analysisDomain.CanvasChart
	LibraryOrder []analysisDomain.ChartReference
	SeriesColors []analysisDomain.SeriesColor
}

// State is the plaintext of a session's state blob, the one document a viewer rebuilds the analysis
// from. Files lists the sources in the analysis' order, and sources are only ever appended, so a
// series keeps its identifier on every side.
type State struct {
	Format                  int                             `json:"format"`
	Name                    string                          `json:"name"`
	Files                   []Blob                          `json:"files"`
	Canvas                  []analysisDomain.CanvasChart    `json:"canvas"`
	LibraryOrder            []analysisDomain.ChartReference `json:"libraryOrder"`
	SeriesColors            []analysisDomain.SeriesColor    `json:"seriesColors"`
	Log                     *StateLog                       `json:"log"`
	PublishedAtMilliseconds int64                           `json:"publishedAtMilliseconds"`
}

// StateLog is the log of a state, and View the frontend's own description of how it is read and
// shown, carried without being read.
type StateLog struct {
	Blob

	View json.RawMessage `json:"view"`
}

// Publication is what the frontend adds to a publication that only it holds: the log a person
// opened over the analysis. A nil Log is an analysis with no log open.
type Publication struct {
	Log *PublishedLog `json:"log"`
}

// PublishedLog is the log of a publication. Content is left out when the log is the one already
// published, so a chart moved does not carry tens of megabytes of log across the bridge again.
type PublishedLog struct {
	Name    string          `json:"name"`
	Content *string         `json:"content,omitempty"`
	View    json.RawMessage `json:"view"`
}

// Status is a live session as the owner's frontend shows it: the link, how long it lives, and which
// of the analysis' files are online.
type Status struct {
	AnalysisID            string       `json:"analysisId"`
	SessionID             string       `json:"sessionId"`
	Link                  string       `json:"link"`
	Revision              int64        `json:"revision"`
	ExpiresAtMilliseconds int64        `json:"expiresAtMilliseconds"`
	Files                 []FileStatus `json:"files"`
	Log                   *LogStatus   `json:"log"`
}

type FileStatus struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Online bool   `json:"online"`
}

type LogStatus struct {
	Name   string `json:"name"`
	Online bool   `json:"online"`
}

// Joined is a session as a viewer's frontend follows it: the analysis rebuilt in the tab, the
// socket that announces new revisions, and the log, which only the frontend reads.
type Joined struct {
	SessionID             string     `json:"sessionId"`
	AnalysisID            string     `json:"analysisId"`
	Revision              int64      `json:"revision"`
	ExpiresAtMilliseconds int64      `json:"expiresAtMilliseconds"`
	LiveURL               string     `json:"liveUrl"`
	Changed               bool       `json:"changed"`
	Log                   *JoinedLog `json:"log"`
}

// JoinedLog is the log of a joined session. Content is left out when the log is the one the
// previous answer for this session carried, which the frontend already holds: a refresh comes every
// time the owner changes anything, and the same tens of megabytes would cross the bridge each time.
type JoinedLog struct {
	FileID  string          `json:"fileId"`
	Name    string          `json:"name"`
	Content string          `json:"content,omitempty"`
	View    json.RawMessage `json:"view"`
}
