package httpsurface

import (
	"net/http"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
)

// maximumPublicationBytes bounds a live publication's body, which can carry a log a person opened:
// up to twenty-five megabytes of text, and more once JSON has escaped it.
const maximumPublicationBytes = 64 << 20

// joinBody is the two halves of a link the page split: the session, and the key after it.
type joinBody struct {
	SessionID string `json:"sessionId"`
	Key       string `json:"key"`
}

// registerSessionRoutes is the live sessions of docs/SHARING.md: the ones this app owns, under the
// analysis they publish, and the ones this tab follows, under the session they rebuild.
func registerSessionRoutes(mux *http.ServeMux, operations *surface.Operations) {
	mux.HandleFunc("GET /api/sessions", func(writer http.ResponseWriter, request *http.Request) {
		statuses, err := operations.ListSessions(request.Context())
		respond(writer, statuses, err)
	})

	mux.HandleFunc("POST /api/analyses/{id}/session", func(writer http.ResponseWriter, request *http.Request) {
		var body surface.SessionPublication
		if !decodeWithin(writer, request, &body, maximumPublicationBytes) {
			return
		}

		status, err := operations.StartSession(request.Context(), request.PathValue("id"), body)
		respondCreated(writer, status, err)
	})

	mux.HandleFunc("PUT /api/analyses/{id}/session", func(writer http.ResponseWriter, request *http.Request) {
		var body surface.SessionPublication
		if !decodeWithin(writer, request, &body, maximumPublicationBytes) {
			return
		}

		status, err := operations.PublishSession(request.Context(), request.PathValue("id"), body)
		respond(writer, status, err)
	})

	mux.HandleFunc("GET /api/analyses/{id}/session", func(writer http.ResponseWriter, request *http.Request) {
		status, err := operations.SessionStatus(request.Context(), request.PathValue("id"))
		respond(writer, status, err)
	})

	mux.HandleFunc("DELETE /api/analyses/{id}/session", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, operations.EndSession(request.Context(), request.PathValue("id")))
	})

	mux.HandleFunc("POST /api/shared-sessions", func(writer http.ResponseWriter, request *http.Request) {
		var body joinBody
		if !decode(writer, request, &body) {
			return
		}

		joined, err := operations.JoinSession(request.Context(), body.SessionID, body.Key)
		respondCreated(writer, joined, err)
	})

	mux.HandleFunc("POST /api/shared-sessions/{sessionId}/refresh", func(writer http.ResponseWriter, request *http.Request) {
		joined, err := operations.RefreshSession(request.Context(), request.PathValue("sessionId"))
		respond(writer, joined, err)
	})

	mux.HandleFunc("DELETE /api/shared-sessions/{sessionId}", func(writer http.ResponseWriter, request *http.Request) {
		respondEmpty(writer, operations.ForgetSession(request.Context(), request.PathValue("sessionId")))
	})
}
