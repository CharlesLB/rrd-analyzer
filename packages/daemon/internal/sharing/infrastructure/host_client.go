// Package infrastructure reaches the share service over HTTP, keeps the live sessions this app owns
// (in the SQLite file beside the library, or in memory for the browser edition), and draws the
// randomness keys and nonces come from.
package infrastructure

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

const (
	_sessionsPath  = "/api/sessions/"
	_createPath    = "/api/sessions"
	_statePath     = "/state"
	_filesSegment  = "/files/"
	_chunksSegment = "/chunks/"

	_authorizationHeader = "Authorization"
	_bearerPrefix        = "Bearer "
	_contentTypeHeader   = "Content-Type"
	_sealedContentType   = "application/octet-stream"
	_revisionHeader      = "X-Session-Revision"
	_expiresAtHeader     = "X-Session-Expires-At"

	_decimal       = 10
	_sixtyFourBits = 64

	// _requestTimeout bounds one request: an eight-mebibyte chunk over a slow uplink takes seconds,
	// and a service that has not answered in two minutes is not going to.
	_requestTimeout = 2 * time.Minute

	// _maximumAnswerBytes is the largest answer read: a sealed chunk, the nonce and the tag on top of
	// eight mebibytes. A sealed state is at most four. Anything longer is not this protocol.
	_maximumAnswerBytes = domain.ChunkBytes + 64
)

// HostClient speaks the share service's protocol. Under GOOS=js net/http goes through the browser's
// fetch, so the browser edition reaches the service with the same code the desktop does.
type HostClient struct {
	baseURL string
	client  *http.Client
}

func NewHostClient(baseURL string) *HostClient {
	return &HostClient{baseURL: baseURL, client: &http.Client{Timeout: _requestTimeout}}
}

// exchange is one request: what is sent, with the owner's token when it writes, and the status a
// success is answered with.
type exchange struct {
	method       string
	path         string
	ownerToken   string
	body         []byte
	succeedsWith int
}

// answer is a successful exchange's body and headers.
type answer struct {
	body   []byte
	header http.Header
}

type createdBody struct {
	SessionID             string `json:"sessionId"`
	OwnerToken            string `json:"ownerToken"`
	ExpiresAtMilliseconds int64  `json:"expiresAtMilliseconds"`
}

type revisionBody struct {
	Revision              int64 `json:"revision"`
	ExpiresAtMilliseconds int64 `json:"expiresAtMilliseconds"`
}

func (host *HostClient) Create(callerContext context.Context) (domain.CreatedSession, error) {
	var created createdBody
	if err := host.exchangeJSON(callerContext, exchange{method: http.MethodPost, path: _createPath, succeedsWith: http.StatusCreated}, &created); err != nil {
		return domain.CreatedSession{}, err
	}

	return domain.CreatedSession{
		Credentials: domain.Credentials{SessionID: created.SessionID, OwnerToken: created.OwnerToken},
		ExpiresAt:   time.UnixMilli(created.ExpiresAtMilliseconds),
	}, nil
}

func (host *HostClient) PutChunk(callerContext context.Context, credentials domain.Credentials, fileID string, index int, sealed []byte) error {
	_, err := host.exchange(callerContext, exchange{
		method:       http.MethodPut,
		path:         chunkPath(credentials.SessionID, fileID, index),
		ownerToken:   credentials.OwnerToken,
		body:         sealed,
		succeedsWith: http.StatusNoContent,
	})

	return err
}

func (host *HostClient) PutState(callerContext context.Context, credentials domain.Credentials, sealed []byte) (domain.Revision, error) {
	var revision revisionBody
	if err := host.exchangeJSON(callerContext, exchange{
		method:       http.MethodPut,
		path:         _sessionsPath + credentials.SessionID + _statePath,
		ownerToken:   credentials.OwnerToken,
		body:         sealed,
		succeedsWith: http.StatusOK,
	}, &revision); err != nil {
		return domain.Revision{}, err
	}

	return revisionOf(revision), nil
}

// State reads the sealed state, and where the session stands from the two headers the service
// sends beside it.
func (host *HostClient) State(callerContext context.Context, sessionID string) (domain.SealedState, error) {
	answered, err := host.exchange(callerContext, exchange{method: http.MethodGet, path: _sessionsPath + sessionID + _statePath, succeedsWith: http.StatusOK})
	if err != nil {
		return domain.SealedState{}, err
	}

	revision, err := headerNumber(answered.header, _revisionHeader)
	if err != nil {
		return domain.SealedState{}, err
	}

	expiresAt, err := headerNumber(answered.header, _expiresAtHeader)
	if err != nil {
		return domain.SealedState{}, err
	}

	return domain.SealedState{Sealed: answered.body, Revision: domain.Revision{Number: revision, ExpiresAt: time.UnixMilli(expiresAt)}}, nil
}

func (host *HostClient) Chunk(callerContext context.Context, sessionID string, fileID string, index int) ([]byte, error) {
	answered, err := host.exchange(callerContext, exchange{method: http.MethodGet, path: chunkPath(sessionID, fileID, index), succeedsWith: http.StatusOK})
	if err != nil {
		return nil, err
	}

	return answered.body, nil
}

func (host *HostClient) Status(callerContext context.Context, sessionID string) (domain.Revision, error) {
	var revision revisionBody
	if err := host.exchangeJSON(callerContext, exchange{method: http.MethodGet, path: _sessionsPath + sessionID, succeedsWith: http.StatusOK}, &revision); err != nil {
		return domain.Revision{}, err
	}

	return revisionOf(revision), nil
}

func (host *HostClient) End(callerContext context.Context, credentials domain.Credentials) error {
	_, err := host.exchange(callerContext, exchange{
		method:       http.MethodDelete,
		path:         _sessionsPath + credentials.SessionID,
		ownerToken:   credentials.OwnerToken,
		succeedsWith: http.StatusNoContent,
	})

	return err
}

func (host *HostClient) exchangeJSON(callerContext context.Context, sent exchange, target any) error {
	answered, err := host.exchange(callerContext, sent)
	if err != nil {
		return err
	}

	if err := json.Unmarshal(answered.body, target); err != nil {
		return fmt.Errorf("%w: %s %s answered JSON that does not read: %w", domain.ErrServiceFailed, sent.method, sent.path, err)
	}

	return nil
}

// exchange sends one request and reads its whole answer, up to the largest this protocol has.
func (host *HostClient) exchange(callerContext context.Context, sent exchange) (answer, error) {
	request, err := http.NewRequestWithContext(callerContext, sent.method, host.baseURL+sent.path, bytes.NewReader(sent.body))
	if err != nil {
		return answer{}, fmt.Errorf("%w: %s %s cannot be sent: %w", domain.ErrServiceFailed, sent.method, sent.path, err)
	}

	if sent.ownerToken != "" {
		request.Header.Set(_authorizationHeader, _bearerPrefix+sent.ownerToken)
	}

	if sent.body != nil {
		request.Header.Set(_contentTypeHeader, _sealedContentType)
	}

	response, err := host.client.Do(request)
	if err != nil {
		return answer{}, fmt.Errorf("%w: %s %s: %w", domain.ErrServiceFailed, sent.method, sent.path, err)
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, _maximumAnswerBytes+1))
	if err != nil {
		return answer{}, fmt.Errorf("%w: %s %s was cut short: %w", domain.ErrServiceFailed, sent.method, sent.path, err)
	}

	if response.StatusCode != sent.succeedsWith {
		return answer{}, failureOf(sent, response.StatusCode)
	}

	if len(body) > _maximumAnswerBytes {
		return answer{}, fmt.Errorf("%w: %s %s answered more than any blob of a session holds", domain.ErrServiceFailed, sent.method, sent.path)
	}

	return answer{body: body, header: response.Header}, nil
}

// failureOf is what a status other than the one a success has means.
func failureOf(sent exchange, status int) error {
	switch status {
	case http.StatusNotFound:
		return domain.ErrSessionEnded
	case http.StatusRequestEntityTooLarge:
		return domain.ErrTooLarge
	case http.StatusTooManyRequests:
		return domain.ErrServiceBusy
	}

	return fmt.Errorf("%w: %s %s answered %d", domain.ErrServiceFailed, sent.method, sent.path, status)
}

func headerNumber(header http.Header, name string) (int64, error) {
	number, err := strconv.ParseInt(header.Get(name), _decimal, _sixtyFourBits)
	if err != nil {
		return 0, fmt.Errorf("%w: the %s header does not read: %w", domain.ErrServiceFailed, name, err)
	}

	return number, nil
}

func revisionOf(revision revisionBody) domain.Revision {
	return domain.Revision{Number: revision.Revision, ExpiresAt: time.UnixMilli(revision.ExpiresAtMilliseconds)}
}

func chunkPath(sessionID string, fileID string, index int) string {
	return _sessionsPath + sessionID + _filesSegment + fileID + _chunksSegment + strconv.Itoa(index)
}
