// Package sharetest is the share service in memory, behind an httptest server, for the tests of
// every package that publishes or follows a live session. It answers the routes of docs/SHARING.md
// the way the Worker in packages/share-service does, without what only the Worker is responsible for:
// rate limits per address, the WebSocket, and checking the shape of identifiers.
package sharetest

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"time"
)

const (
	_identifierBytes     = 16
	_ownerTokenPrefix    = "owner-token-"
	_bearerPrefix        = "Bearer "
	_authorizationHeader = "Authorization"
	_revisionHeader      = "X-Session-Revision"
	_expiresAtHeader     = "X-Session-Expires-At"
	_contentTypeHeader   = "Content-Type"
	_jsonContentType     = "application/json"
	_chunkSeparator      = "/"
	_decimal             = 10

	// DefaultSessionBytes is the most a session holds across its chunks, as the Worker keeps it.
	DefaultSessionBytes = 256 << 20
)

// _expiresAt is when every session ends: one instant, so a test can compare it.
var _expiresAt = time.Date(2026, time.January, 1, 1, 0, 0, 0, time.UTC)

// Server is the share service. Every session it holds ends at ExpiresAt, unless a test ends it
// sooner with Expire.
type Server struct {
	served *httptest.Server

	mutex               sync.Mutex
	sessions            map[string]*session
	created             uint64
	maximumSessionBytes int
	refusesNewSessions  bool
}

type session struct {
	ownerToken string
	revision   int64
	state      []byte
	chunks     map[string][]byte
}

func NewServer() *Server {
	server := &Server{sessions: make(map[string]*session), maximumSessionBytes: DefaultSessionBytes}

	routes := http.NewServeMux()
	routes.HandleFunc("POST /api/sessions", server.create)
	routes.HandleFunc("PUT /api/sessions/{id}/files/{fileId}/chunks/{index}", server.putChunk)
	routes.HandleFunc("PUT /api/sessions/{id}/state", server.putState)
	routes.HandleFunc("GET /api/sessions/{id}/state", server.state)
	routes.HandleFunc("GET /api/sessions/{id}/files/{fileId}/chunks/{index}", server.chunk)
	routes.HandleFunc("GET /api/sessions/{id}", server.status)
	routes.HandleFunc("DELETE /api/sessions/{id}", server.end)

	server.served = httptest.NewServer(routes)

	return server
}

// URL is the address the service answers at, the way SHARE_SERVICE_URL names it.
func (server *Server) URL() string {
	return server.served.URL
}

func (server *Server) Close() {
	server.served.Close()
}

// ExpiresAt is when every session the server holds ends.
func (server *Server) ExpiresAt() time.Time {
	return _expiresAt
}

// Expire ends a session the way its alarm would.
func (server *Server) Expire(sessionID string) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	delete(server.sessions, sessionID)
}

// Holds says whether the server still holds a session.
func (server *Server) Holds(sessionID string) bool {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	_, held := server.sessions[sessionID]

	return held
}

// LimitSessionBytes lowers how much one session holds across its chunks.
func (server *Server) LimitSessionBytes(maximum int) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	server.maximumSessionBytes = maximum
}

// RefuseNewSessions answers every creation from now on the way a rate limit does.
func (server *Server) RefuseNewSessions() {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	server.refusesNewSessions = true
}

func (server *Server) create(writer http.ResponseWriter, _ *http.Request) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	if server.refusesNewSessions {
		writer.WriteHeader(http.StatusTooManyRequests)

		return
	}

	server.created++
	raw := make([]byte, _identifierBytes)
	binary.BigEndian.PutUint64(raw, server.created)
	sessionID := base64.RawURLEncoding.EncodeToString(raw)
	ownerToken := _ownerTokenPrefix + strconv.FormatUint(server.created, _decimal)

	server.sessions[sessionID] = &session{ownerToken: ownerToken, chunks: make(map[string][]byte)}

	writer.Header().Set(_contentTypeHeader, _jsonContentType)
	writer.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(writer).Encode(map[string]any{
		"sessionId":             sessionID,
		"ownerToken":            ownerToken,
		"expiresAtMilliseconds": _expiresAt.UnixMilli(),
	})
}

func (server *Server) putChunk(writer http.ResponseWriter, request *http.Request) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	held, isOwner := server.owned(writer, request)
	if !isOwner {
		return
	}

	content, _ := io.ReadAll(request.Body)
	key := request.PathValue("fileId") + _chunkSeparator + request.PathValue("index")

	if sizeWithout(held, key)+len(content) > server.maximumSessionBytes {
		writer.WriteHeader(http.StatusRequestEntityTooLarge)

		return
	}

	held.chunks[key] = content
	writer.WriteHeader(http.StatusNoContent)
}

func (server *Server) putState(writer http.ResponseWriter, request *http.Request) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	held, isOwner := server.owned(writer, request)
	if !isOwner {
		return
	}

	held.state, _ = io.ReadAll(request.Body)
	held.revision++

	writeRevision(writer, held)
}

func (server *Server) state(writer http.ResponseWriter, request *http.Request) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	held, isHeld := server.found(writer, request)
	if !isHeld {
		return
	}

	if held.state == nil {
		writer.WriteHeader(http.StatusConflict)

		return
	}

	writer.Header().Set(_revisionHeader, strconv.FormatInt(held.revision, _decimal))
	writer.Header().Set(_expiresAtHeader, strconv.FormatInt(_expiresAt.UnixMilli(), _decimal))
	_, _ = writer.Write(held.state)
}

func (server *Server) chunk(writer http.ResponseWriter, request *http.Request) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	held, isHeld := server.found(writer, request)
	if !isHeld {
		return
	}

	content, isStored := held.chunks[request.PathValue("fileId")+_chunkSeparator+request.PathValue("index")]
	if !isStored {
		writer.WriteHeader(http.StatusNotFound)

		return
	}

	_, _ = writer.Write(content)
}

func (server *Server) status(writer http.ResponseWriter, request *http.Request) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	held, isHeld := server.found(writer, request)
	if !isHeld {
		return
	}

	writeRevision(writer, held)
}

func (server *Server) end(writer http.ResponseWriter, request *http.Request) {
	server.mutex.Lock()
	defer server.mutex.Unlock()

	if _, isOwner := server.owned(writer, request); !isOwner {
		return
	}

	delete(server.sessions, request.PathValue("id"))
	writer.WriteHeader(http.StatusNoContent)
}

// found is the session a request names, or a 404 already written.
func (server *Server) found(writer http.ResponseWriter, request *http.Request) (*session, bool) {
	held, isHeld := server.sessions[request.PathValue("id")]
	if !isHeld {
		writer.WriteHeader(http.StatusNotFound)
	}

	return held, isHeld
}

// owned is the session a request names when it carries that session's owner token, or a 404 or a
// 403 already written.
func (server *Server) owned(writer http.ResponseWriter, request *http.Request) (*session, bool) {
	held, isHeld := server.found(writer, request)
	if !isHeld {
		return nil, false
	}

	if request.Header.Get(_authorizationHeader) != _bearerPrefix+held.ownerToken {
		writer.WriteHeader(http.StatusForbidden)

		return nil, false
	}

	return held, true
}

func writeRevision(writer http.ResponseWriter, held *session) {
	writer.Header().Set(_contentTypeHeader, _jsonContentType)
	_ = json.NewEncoder(writer).Encode(map[string]int64{"revision": held.revision, "expiresAtMilliseconds": _expiresAt.UnixMilli()})
}

func sizeWithout(held *session, replaced string) int {
	total := 0
	for key, content := range held.chunks {
		if key != replaced {
			total += len(content)
		}
	}

	return total
}
