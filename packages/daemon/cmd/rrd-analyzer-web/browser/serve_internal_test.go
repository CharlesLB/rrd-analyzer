package browser

import (
	"context"
	"io"
	"net/http"
	"testing"
	"time"
)

const cancellationBound = 5 * time.Second

func editionServing(handler http.Handler) *Edition {
	return &Edition{handler: handler, requests: newRequestRegistry()}
}

func TestServeStopsACallTheCallerCancels(t *testing.T) {
	started := make(chan struct{})
	edition := editionServing(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		close(started)
		<-request.Context().Done()
		writer.WriteHeader(http.StatusServiceUnavailable)
	}))
	answered := make(chan Answer, 1)

	go func() {
		answered <- edition.Serve(context.Background(), Call{RequestID: "insights-1", Method: http.MethodPost, Path: "/api/analyses/a/insights"})
	}()

	<-started
	edition.Cancel("insights-1")

	select {
	case answer := <-answered:
		if answer.Status != http.StatusServiceUnavailable {
			t.Fatalf("want the status the cancelled route wrote, got %d", answer.Status)
		}
	case <-time.After(cancellationBound):
		t.Fatal("the call was still running after it was cancelled")
	}
}

func TestServeHandsTheRouteTheBodyAsJSONAndAnswersWhatItWrote(t *testing.T) {
	edition := editionServing(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte(request.Method + " " + request.URL.Path + " " + request.Header.Get("Content-Type") + " " + string(body)))
	}))

	answer := edition.Serve(context.Background(), Call{RequestID: "1", Method: http.MethodPost, Path: "/api/analyses", Body: []byte(`{"name":"a"}`)})

	if answer.Status != http.StatusCreated || string(answer.Body) != `POST /api/analyses application/json {"name":"a"}` {
		t.Fatalf("got %d %q", answer.Status, answer.Body)
	}
}

func TestCancelIgnoresACallThatIsNoLongerRunning(t *testing.T) {
	edition := editionServing(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))

	answer := edition.Serve(context.Background(), Call{RequestID: "1", Method: http.MethodDelete, Path: "/api/analyses/a"})
	edition.Cancel("1")
	edition.Cancel("never-sent")

	if answer.Status != http.StatusNoContent {
		t.Fatalf("want %d, got %d", http.StatusNoContent, answer.Status)
	}
}
