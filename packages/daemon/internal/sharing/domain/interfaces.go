package domain

import (
	"context"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
)

// Host is the share service, as docs/SHARING.md describes its routes. It only ever sees sealed
// bytes: sealing and opening them is this domain's, and the key never leaves the apps.
//
// A session the service no longer holds is ErrSessionEnded on every call that names one; anything
// the service refuses for size is ErrTooLarge, a refusal to start one more session is
// ErrServiceBusy, and every other failure, a service unreachable among them, is ErrServiceFailed.
type Host interface {
	Create(callerContext context.Context) (CreatedSession, error)
	PutChunk(callerContext context.Context, credentials Credentials, fileID string, index int, sealed []byte) error
	PutState(callerContext context.Context, credentials Credentials, sealed []byte) (Revision, error)
	State(callerContext context.Context, sessionID string) (SealedState, error)
	Chunk(callerContext context.Context, sessionID string, fileID string, index int) ([]byte, error)
	Status(callerContext context.Context, sessionID string) (Revision, error)
	End(callerContext context.Context, credentials Credentials) error
}

// Registry is the live sessions this app owns, one at most per analysis. Get reports ErrNotLive for
// an analysis with none.
//
// Renew writes only where a session stands. The status a frontend polls for runs beside a
// publication still uploading, and saving the whole session it read before the upload began would
// undo the files the publication marked online since.
type Registry interface {
	List(callerContext context.Context) ([]OwnedSession, error)
	Get(callerContext context.Context, analysisID string) (OwnedSession, error)
	Save(callerContext context.Context, session OwnedSession) error
	Renew(callerContext context.Context, analysisID string, revision Revision) error
	Forget(callerContext context.Context, analysisID string) error
}

// Library is the analysis library as a live session reads and rebuilds it. A viewer's analysis is
// created over files kept in memory, then arranged the way the owner's is; Create answers with the
// new analysis' identifier.
type Library interface {
	Analysis(callerContext context.Context, analysisID string) (analysisDomain.Analysis, error)
	Create(callerContext context.Context, name string, files []analysisDomain.SourceFile) (string, error)
	AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) error
	Arrange(callerContext context.Context, analysisID string, arrangement Arrangement) error
	Delete(callerContext context.Context, analysisID string) error
}

// SourceReader reads one source file whole, wherever the binary keeps sources: on disk, or in the
// memory of a browser tab.
type SourceReader interface {
	Read(callerContext context.Context, path string) ([]byte, error)
}

// SourceFormat says whether bytes are a source the application plots. An analysis can be created
// over any path, and without this a live session would be a way to publish any file on the
// machine.
type SourceFormat interface {
	Recognises(content []byte) bool
}

// FileKeeper keeps the files a viewer downloads in memory, under paths an analysis can name, and
// lets go of them when the session ends. Only the browser edition has one.
type FileKeeper interface {
	Keep(name string, content []byte) string
	Forget(path string)
}

// Entropy fills a buffer with random bytes, for keys and nonces. Behind a port so tests can seal
// the same bytes twice.
type Entropy interface {
	Fill(buffer []byte)
}

type Clock interface {
	Now() time.Time
}
