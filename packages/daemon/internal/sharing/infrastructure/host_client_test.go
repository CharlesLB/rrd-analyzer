package infrastructure_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
)

const (
	fileID     = "AAAAAAAAAAAAAAAAAAAAAA"
	firstChunk = 0
)

// hostOver is a client of a share service in memory, and the service.
func hostOver(t *testing.T) (*sharingInfra.HostClient, *sharetest.Server) {
	t.Helper()

	server := sharetest.Started(t)

	return sharingInfra.NewHostClient(server.URL()), server
}

func created(t *testing.T, host *sharingInfra.HostClient) domain.CreatedSession {
	t.Helper()

	session, err := host.Create(context.Background())
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	return session
}

func TestHostClient_ASessionsWholeLife_GoesThroughTheService(t *testing.T) {
	host, server := hostOver(t)
	session := created(t, host)
	callerContext := context.Background()

	if session.Credentials.SessionID == "" || session.Credentials.OwnerToken == "" || !session.ExpiresAt.Equal(server.ExpiresAt()) {
		t.Fatalf("created = %+v, want an identifier, a token and the service's end", session)
	}

	if err := host.PutChunk(callerContext, session.Credentials, fileID, firstChunk, []byte("sealed chunk")); err != nil {
		t.Fatalf("put chunk: %v", err)
	}

	if err := host.PutChunk(callerContext, session.Credentials, fileID, firstChunk, []byte("sealed again")); err != nil {
		t.Fatalf("put the chunk again: %v", err)
	}

	revision, err := host.PutState(callerContext, session.Credentials, []byte("sealed state"))
	if err != nil || revision.Number != 1 || !revision.ExpiresAt.Equal(server.ExpiresAt()) {
		t.Fatalf("put state = %+v, %v; want revision 1 ending at the service's end", revision, err)
	}

	state, err := host.State(callerContext, session.Credentials.SessionID)
	if err != nil || string(state.Sealed) != "sealed state" || state.Revision != revision {
		t.Fatalf("state = %+v, %v; want the state put, at revision 1", state, err)
	}

	chunk, err := host.Chunk(callerContext, session.Credentials.SessionID, fileID, firstChunk)
	if err != nil || string(chunk) != "sealed again" {
		t.Fatalf("chunk = %q, %v; want the chunk put last", chunk, err)
	}

	status, err := host.Status(callerContext, session.Credentials.SessionID)
	if err != nil || status != revision {
		t.Fatalf("status = %+v, %v; want revision 1", status, err)
	}

	if err := host.End(callerContext, session.Credentials); err != nil {
		t.Fatalf("end: %v", err)
	}

	if server.Holds(session.Credentials.SessionID) {
		t.Error("the service still holds the session ended")
	}
}

func TestHostClient_WhatTheServiceRefuses_IsTheDomainsError(t *testing.T) {
	tests := []struct {
		name    string
		giveRun func(t *testing.T, host *sharingInfra.HostClient, server *sharetest.Server) error
		wantErr error
	}{
		{name: "a session that ended", giveRun: func(t *testing.T, host *sharingInfra.HostClient, server *sharetest.Server) error {
			session := created(t, host)
			server.Expire(session.Credentials.SessionID)

			_, err := host.Status(context.Background(), session.Credentials.SessionID)

			return err
		}, wantErr: domain.ErrSessionEnded},
		{name: "a chunk put into a session that ended", giveRun: func(t *testing.T, host *sharingInfra.HostClient, server *sharetest.Server) error {
			session := created(t, host)
			server.Expire(session.Credentials.SessionID)

			return host.PutChunk(context.Background(), session.Credentials, fileID, firstChunk, []byte("sealed chunk"))
		}, wantErr: domain.ErrSessionEnded},
		{name: "a chunk of a session that ended", giveRun: func(t *testing.T, host *sharingInfra.HostClient, server *sharetest.Server) error {
			session := created(t, host)
			server.Expire(session.Credentials.SessionID)

			_, err := host.Chunk(context.Background(), session.Credentials.SessionID, fileID, firstChunk)

			return err
		}, wantErr: domain.ErrSessionEnded},
		{name: "a chunk the session never held", giveRun: func(t *testing.T, host *sharingInfra.HostClient, _ *sharetest.Server) error {
			session := created(t, host)

			_, err := host.Chunk(context.Background(), session.Credentials.SessionID, fileID, firstChunk)

			return err
		}, wantErr: domain.ErrSessionEnded},
		{name: "a session past its size", giveRun: func(t *testing.T, host *sharingInfra.HostClient, server *sharetest.Server) error {
			session := created(t, host)
			server.LimitSessionBytes(4)

			return host.PutChunk(context.Background(), session.Credentials, fileID, firstChunk, []byte("too long"))
		}, wantErr: domain.ErrTooLarge},
		{name: "a service refusing new sessions", giveRun: func(_ *testing.T, host *sharingInfra.HostClient, server *sharetest.Server) error {
			server.RefuseNewSessions()

			_, err := host.Create(context.Background())

			return err
		}, wantErr: domain.ErrServiceBusy},
		{name: "a write with someone else's token", giveRun: func(t *testing.T, host *sharingInfra.HostClient, _ *sharetest.Server) error {
			session := created(t, host)
			session.Credentials.OwnerToken = "not the owner's"

			_, err := host.PutState(context.Background(), session.Credentials, []byte("sealed state"))

			return err
		}, wantErr: domain.ErrServiceFailed},
		{name: "a state asked for before one was published", giveRun: func(t *testing.T, host *sharingInfra.HostClient, _ *sharetest.Server) error {
			session := created(t, host)

			_, err := host.State(context.Background(), session.Credentials.SessionID)

			return err
		}, wantErr: domain.ErrServiceFailed},
		{name: "an end of a session that ended", giveRun: func(t *testing.T, host *sharingInfra.HostClient, server *sharetest.Server) error {
			session := created(t, host)
			server.Expire(session.Credentials.SessionID)

			return host.End(context.Background(), session.Credentials)
		}, wantErr: domain.ErrSessionEnded},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			host, server := hostOver(t)

			if err := tt.giveRun(t, host, server); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestHostClient_AServiceThatCannotBeReached_FailsEveryCall(t *testing.T) {
	server := sharetest.NewServer()
	host := sharingInfra.NewHostClient(server.URL())
	server.Close()

	if _, err := host.Create(context.Background()); !errors.Is(err, domain.ErrServiceFailed) {
		t.Errorf("err = %v, want %v", err, domain.ErrServiceFailed)
	}
}

func TestHostClient_AnAddressThatIsNotOne_FailsBeforeAnythingIsSent(t *testing.T) {
	host := sharingInfra.NewHostClient("http://not an address")

	if _, err := host.Status(context.Background(), "session"); !errors.Is(err, domain.ErrServiceFailed) || !strings.Contains(err.Error(), "cannot be sent") {
		t.Errorf("err = %v, want the request refused before it is sent", err)
	}
}

// answering is a service that answers every request with the one handler, whatever it asked for.
func answering(t *testing.T, handler http.HandlerFunc) *sharingInfra.HostClient {
	t.Helper()

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	return sharingInfra.NewHostClient(server.URL)
}

func TestHostClient_AnAnswerOutsideTheProtocol_IsTheServiceFailing(t *testing.T) {
	stateWithHeaders := func(revision string, expiresAt string) http.HandlerFunc {
		return func(writer http.ResponseWriter, _ *http.Request) {
			writer.Header().Set("X-Session-Revision", revision)
			writer.Header().Set("X-Session-Expires-At", expiresAt)
			_, _ = writer.Write([]byte("sealed state"))
		}
	}

	tests := []struct {
		name        string
		giveHandler http.HandlerFunc
		giveCall    func(host *sharingInfra.HostClient) error
		wantMessage string
	}{
		{name: "JSON that does not read", giveHandler: func(writer http.ResponseWriter, _ *http.Request) {
			_, _ = writer.Write([]byte("not JSON"))
		}, giveCall: func(host *sharingInfra.HostClient) error {
			_, err := host.Status(context.Background(), "session")

			return err
		}, wantMessage: "does not read"},
		{name: "a revision header that is not a number", giveHandler: stateWithHeaders("first", "1"), giveCall: func(host *sharingInfra.HostClient) error {
			_, err := host.State(context.Background(), "session")

			return err
		}, wantMessage: "X-Session-Revision"},
		{name: "an end header that is not a number", giveHandler: stateWithHeaders("1", "soon"), giveCall: func(host *sharingInfra.HostClient) error {
			_, err := host.State(context.Background(), "session")

			return err
		}, wantMessage: "X-Session-Expires-At"},
		{name: "an answer longer than any blob", giveHandler: func(writer http.ResponseWriter, _ *http.Request) {
			_, _ = writer.Write(bytes.Repeat([]byte{1}, domain.ChunkBytes+128))
		}, giveCall: func(host *sharingInfra.HostClient) error {
			_, err := host.Chunk(context.Background(), "session", fileID, firstChunk)

			return err
		}, wantMessage: "more than any blob"},
		{name: "an answer cut short", giveHandler: func(writer http.ResponseWriter, _ *http.Request) {
			writer.Header().Set("Content-Length", "100")
			_, _ = writer.Write([]byte("short"))
		}, giveCall: func(host *sharingInfra.HostClient) error {
			_, err := host.Chunk(context.Background(), "session", fileID, firstChunk)

			return err
		}, wantMessage: "cut short"},
		{name: "a status the protocol does not have", giveHandler: func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusTeapot)
		}, giveCall: func(host *sharingInfra.HostClient) error {
			return host.End(context.Background(), domain.Credentials{SessionID: "session", OwnerToken: "token"})
		}, wantMessage: "answered 418"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.giveCall(answering(t, tt.giveHandler))

			if !errors.Is(err, domain.ErrServiceFailed) || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("err = %v, want the service failing, saying %q", err, tt.wantMessage)
			}
		})
	}
}

func TestHostClient_AWrite_CarriesTheOwnersTokenAndASealedBody(t *testing.T) {
	var authorization, contentType string

	host := answering(t, func(writer http.ResponseWriter, request *http.Request) {
		authorization, contentType = request.Header.Get("Authorization"), request.Header.Get("Content-Type")
		writer.WriteHeader(http.StatusNoContent)
	})

	if err := host.PutChunk(context.Background(), domain.Credentials{SessionID: "session", OwnerToken: "token"}, fileID, firstChunk, []byte("sealed")); err != nil {
		t.Fatalf("put chunk: %v", err)
	}

	if authorization != "Bearer token" || contentType != "application/octet-stream" {
		t.Errorf("sent Authorization %q and Content-Type %q, want the bearer token and raw bytes", authorization, contentType)
	}
}

func TestHostClient_LiveURL_IsTheSessionsSocketOnTheServicesHost(t *testing.T) {
	tests := []struct {
		name        string
		giveAddress string
		wantURL     string
	}{
		{name: "an http service", giveAddress: "http://127.0.0.1:8787", wantURL: "ws://127.0.0.1:8787/api/sessions/session/live"},
		{name: "an https service", giveAddress: "https://share.example", wantURL: "wss://share.example/api/sessions/session/live"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sharingInfra.NewHostClient(tt.giveAddress).LiveURL("session"); got != tt.wantURL {
				t.Errorf("live URL = %q, want %q", got, tt.wantURL)
			}
		})
	}
}
