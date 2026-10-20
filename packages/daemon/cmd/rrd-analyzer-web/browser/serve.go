package browser

import (
	"bytes"
	"context"
	"net/http"
	"sync"
)

const jsonContentType = "application/json"

// Call is one request of the page, as it would have been sent over HTTP, under the identifier the
// page cancels it by.
type Call struct {
	RequestID string
	Method    string
	Path      string
	Body      []byte
}

// Answer is the status and body the routes answered a call with.
type Answer struct {
	Status int
	Body   []byte
}

// Serve answers a call by running it through the routes in process, and blocks until they are done.
// The call runs under a context Cancel ends, which is how a page that gave up on a run of insights
// stops it.
func (edition *Edition) Serve(callerContext context.Context, call Call) Answer {
	callContext, cancel := context.WithCancel(callerContext)
	defer cancel()

	edition.requests.start(call.RequestID, cancel)
	defer edition.requests.finish(call.RequestID)

	request, err := http.NewRequestWithContext(callContext, call.Method, call.Path, bytes.NewReader(call.Body))
	if err != nil {
		return Answer{Status: http.StatusBadRequest, Body: []byte("malformed request")}
	}

	if len(call.Body) > 0 {
		request.Header.Set("Content-Type", jsonContentType)
	}

	writer := newAnswerWriter()
	edition.handler.ServeHTTP(writer, request)

	return Answer{Status: writer.status, Body: writer.body.Bytes()}
}

// Cancel stops the call still running under requestID, and does nothing for one already answered.
func (edition *Edition) Cancel(requestID string) {
	edition.requests.cancel(requestID)
}

// requestRegistry is the calls still running, each by the identifier the page gave it.
type requestRegistry struct {
	mutex   sync.Mutex
	running map[string]context.CancelFunc
}

func newRequestRegistry() *requestRegistry {
	return &requestRegistry{running: make(map[string]context.CancelFunc)}
}

func (registry *requestRegistry) start(requestID string, cancel context.CancelFunc) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	registry.running[requestID] = cancel
}

func (registry *requestRegistry) finish(requestID string) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	delete(registry.running, requestID)
}

func (registry *requestRegistry) cancel(requestID string) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()

	if cancel, running := registry.running[requestID]; running {
		cancel()
	}
}

// answerWriter collects what a route writes, the way a connection would have carried it.
type answerWriter struct {
	header      http.Header
	body        bytes.Buffer
	status      int
	wroteHeader bool
}

func newAnswerWriter() *answerWriter {
	return &answerWriter{header: make(http.Header), status: http.StatusOK}
}

func (writer *answerWriter) Header() http.Header {
	return writer.header
}

func (writer *answerWriter) WriteHeader(status int) {
	if writer.wroteHeader {
		return
	}

	writer.status = status
	writer.wroteHeader = true
}

func (writer *answerWriter) Write(content []byte) (int, error) {
	writer.wroteHeader = true

	return writer.body.Write(content)
}
