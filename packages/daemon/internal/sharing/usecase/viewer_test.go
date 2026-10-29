package usecase_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
)

func TestJoin_ALink_RebuildsTheOwnersAnalysisInTheTab(t *testing.T) {
	shared := newWorld(t)
	status := shared.started(t)

	joined := shared.joined(t, status)

	viewed := onlyViewedAnalysis(t, shared.viewer.library)
	if viewed.Name != "Checkout" || !reflect.DeepEqual(viewed.Canvas, ownersCanvas) || !reflect.DeepEqual(viewed.LibraryOrder, ownersOrder) ||
		!reflect.DeepEqual(viewed.SeriesColors, ownersColors) {
		t.Errorf("viewed = %+v, want the owner's name, canvas, order and colors", viewed)
	}

	for index, owned := range []analysisDomain.SourceFile{cpuSource, memorySource} {
		content, err := shared.keeper.Read(context.Background(), viewed.Files[index].Path)
		if err != nil || !bytes.Equal(content, shared.content[owned.Path]) || viewed.Files[index].Name != owned.Name {
			t.Errorf("file %d = %q named %q (%v), want the owner's %q", index, content, viewed.Files[index].Name, err, owned.Name)
		}
	}

	wantLog := &domain.JoinedLog{FileID: joined.Log.FileID, Name: logName, Content: logContent, View: json.RawMessage(logView)}
	wantLive := "ws" + strings.TrimPrefix(shared.server.URL(), "http") + "/api/sessions/" + status.SessionID + "/live"
	if joined.AnalysisID != viewed.ID || joined.Revision != 1 || !joined.Changed || !reflect.DeepEqual(joined.Log, wantLog) || joined.LiveURL != wantLive {
		t.Errorf("joined = %+v, want the analysis rebuilt at revision 1 with the log, followed through %s", joined, wantLive)
	}
}

func TestJoin_ALinkAlreadyFollowed_IsBroughtUpToDateRatherThanRebuilt(t *testing.T) {
	shared := newWorld(t)
	status := shared.started(t)
	first := shared.joined(t, status)

	again := shared.joined(t, status)

	if again.AnalysisID != first.AnalysisID || again.Changed || len(shared.viewer.library.analyses) != 1 {
		t.Errorf("joined again = %+v over %d analyses, want the same analysis unchanged", again, len(shared.viewer.library.analyses))
	}
}

func TestRefresh_ANewRevision_AppendsTheNewFilesAndTakesTheNewArrangement(t *testing.T) {
	shared := newWorld(t)
	joined := shared.joined(t, shared.started(t))
	shared.owner.library.grow(ownedAnalysis, diskSource)
	renamed := shared.owner.library.analyses[ownedAnalysis]
	renamed.Name = "Checkout, after the deploy"
	shared.owner.library.analyses[ownedAnalysis] = renamed

	if _, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, domain.Publication{Log: &domain.PublishedLog{Name: logName, View: []byte(`{}`)}}); err != nil {
		t.Fatalf("publish: %v", err)
	}

	refreshed, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID)
	if err != nil {
		t.Fatalf("refresh: %v", err)
	}

	viewed := onlyViewedAnalysis(t, shared.viewer.library)
	if !refreshed.Changed || refreshed.Revision != 2 || len(viewed.Files) != 3 || viewed.Files[2].Name != "disk.rrd" || viewed.Name != renamed.Name {
		t.Errorf("refreshed = %+v over %+v, want revision 2 with the disk appended and the new name", refreshed, viewed)
	}

	if refreshed.Log.Content != logContent || string(refreshed.Log.View) != `{}` {
		t.Errorf("log = %+v, want the same content under the new view", refreshed.Log)
	}

	unchanged, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID)
	if err != nil || unchanged.Changed || unchanged.Revision != 2 {
		t.Errorf("refresh again = %+v, %v; want nothing newer", unchanged, err)
	}
}

func TestRefresh_ALogReplacedOrRemoved_FollowsTheOwner(t *testing.T) {
	tests := []struct {
		name        string
		givePublish domain.Publication
		wantLog     string
	}{
		{name: "replaced", givePublish: withLog("a new log"), wantLog: "a new log"},
		{name: "removed", givePublish: domain.Publication{}, wantLog: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			joined := shared.joined(t, shared.started(t))

			if _, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, tt.givePublish); err != nil {
				t.Fatalf("publish: %v", err)
			}

			refreshed, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID)
			if err != nil {
				t.Fatalf("refresh: %v", err)
			}

			got := ""
			if refreshed.Log != nil {
				got = refreshed.Log.Content
			}

			if got != tt.wantLog {
				t.Errorf("log content = %q, want %q", got, tt.wantLog)
			}
		})
	}
}

func TestForget_AFollowedSession_LeavesNothingOfItInTheTab(t *testing.T) {
	shared := newWorld(t)
	joined := shared.joined(t, shared.started(t))
	viewed := onlyViewedAnalysis(t, shared.viewer.library)

	if err := shared.viewer.service.Forget(context.Background(), joined.SessionID); err != nil {
		t.Fatalf("forget: %v", err)
	}

	if len(shared.viewer.library.analyses) != 0 || len(keptPaths(shared.keeper, viewed)) != 0 {
		t.Errorf("the tab still holds %d analyses and files %v, want nothing", len(shared.viewer.library.analyses), keptPaths(shared.keeper, viewed))
	}

	if err := shared.viewer.service.Forget(context.Background(), joined.SessionID); !errors.Is(err, domain.ErrNotFollowed) {
		t.Errorf("forget again = %v, want %v", err, domain.ErrNotFollowed)
	}

	if _, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID); !errors.Is(err, domain.ErrNotFollowed) {
		t.Errorf("refresh after forget = %v, want %v", err, domain.ErrNotFollowed)
	}
}

func TestForget_AnAnalysisAPersonDeletedFirst_StillLetsGoOfTheFiles(t *testing.T) {
	tests := []struct {
		name        string
		giveLibrary func(library *fakeLibrary, analysisID string)
		wantErr     error
	}{
		{name: "deleted first", giveLibrary: func(library *fakeLibrary, analysisID string) { delete(library.analyses, analysisID) }},
		{name: "a library that cannot delete", giveLibrary: func(library *fakeLibrary, _ string) { library.failing = deleteOperation }, wantErr: errLibraryUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			joined := shared.joined(t, shared.started(t))
			viewed := onlyViewedAnalysis(t, shared.viewer.library)
			tt.giveLibrary(shared.viewer.library, joined.AnalysisID)

			if err := shared.viewer.service.Forget(context.Background(), joined.SessionID); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}

			if held := keptPaths(shared.keeper, viewed); len(held) != 0 {
				t.Errorf("the tab still holds %v, want every file let go of", held)
			}
		})
	}
}

func TestRelease_AFollowedAnalysisAboutToBeDeleted_LetsGoOfItsFiles(t *testing.T) {
	shared := newWorld(t)
	joined := shared.joined(t, shared.started(t))
	viewed := onlyViewedAnalysis(t, shared.viewer.library)

	if err := shared.viewer.service.Release(context.Background(), joined.AnalysisID); err != nil {
		t.Fatalf("release: %v", err)
	}

	if held := keptPaths(shared.keeper, viewed); len(held) != 0 {
		t.Errorf("the tab still holds %v, want every file let go of", held)
	}

	if _, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID); !errors.Is(err, domain.ErrNotFollowed) {
		t.Errorf("refresh after release = %v, want %v", err, domain.ErrNotFollowed)
	}
}

func TestJoin_ALinkThatIsNotOne_IsRefusedBeforeAnythingIsAsked(t *testing.T) {
	shared := newWorld(t)
	status := shared.started(t)
	sessionID, key := halvesOf(t, status.Link)

	tests := []struct {
		name          string
		giveSessionID string
		giveKey       string
	}{
		{name: "a session that is not base64url", giveSessionID: "not a session!", giveKey: key},
		{name: "a session of another length", giveSessionID: "AAAA", giveKey: key},
		{name: "a key that is not base64url", giveSessionID: sessionID, giveKey: "not a key!"},
		{name: "a key of another length", giveSessionID: sessionID, giveKey: "AAAA"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := shared.viewer.service.Join(context.Background(), tt.giveSessionID, tt.giveKey); !errors.Is(err, domain.ErrLinkInvalid) {
				t.Errorf("err = %v, want %v", err, domain.ErrLinkInvalid)
			}
		})
	}
}

func TestJoin_WhatStopsAJoin_LeavesNothingHalfBuilt(t *testing.T) {
	tests := []struct {
		name      string
		giveWorld func(t *testing.T, shared *world, status domain.Status) (string, string)
		wantErr   error
	}{
		{name: "a key that does not open the state", giveWorld: func(t *testing.T, _ *world, status domain.Status) (string, string) {
			sessionID, _ := halvesOf(t, status.Link)

			return sessionID, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
		}, wantErr: domain.ErrKeyRefused},
		{name: "a session that ended", giveWorld: func(t *testing.T, shared *world, status domain.Status) (string, string) {
			shared.server.Expire(status.SessionID)

			return halvesOf(t, status.Link)
		}, wantErr: domain.ErrSessionEnded},
		{name: "a state too short to have been sealed", giveWorld: func(t *testing.T, shared *world, status domain.Status) (string, string) {
			shared.host.state = func(held domain.SealedState) (domain.SealedState, error) {
				held.Sealed = held.Sealed[:nonceBytes]

				return held, nil
			}

			return halvesOf(t, status.Link)
		}, wantErr: domain.ErrKeyRefused},
		{name: "a chunk the service lost", giveWorld: func(t *testing.T, shared *world, status domain.Status) (string, string) {
			shared.host.chunk = func(string, int, []byte) ([]byte, error) { return nil, domain.ErrSessionEnded }

			return halvesOf(t, status.Link)
		}, wantErr: domain.ErrSessionEnded},
		{name: "a library that cannot create the analysis", giveWorld: func(t *testing.T, shared *world, status domain.Status) (string, string) {
			shared.viewer.library.failing = createOperation

			return halvesOf(t, status.Link)
		}, wantErr: errLibraryUnavailable},
		{name: "a library that cannot arrange it", giveWorld: func(t *testing.T, shared *world, status domain.Status) (string, string) {
			shared.viewer.library.failing = arrangeOperation

			return halvesOf(t, status.Link)
		}, wantErr: errLibraryUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			sessionID, key := tt.giveWorld(t, shared, shared.started(t))

			if _, err := shared.viewer.service.Join(context.Background(), sessionID, key); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}

			if len(shared.viewer.library.analyses) != 0 {
				t.Errorf("the viewer's library holds %+v, want nothing half built", shared.viewer.library.analyses)
			}
		})
	}
}

// joinedOverState has the viewer follow a session, then answers the next state with plaintext a
// test wrote, sealed with the session's key at the session's place.
func joinedOverState(t *testing.T, plaintext func(state domain.State) []byte) (*world, domain.Joined) {
	t.Helper()

	shared := newWorld(t)
	status := shared.started(t)
	joined := shared.joined(t, status)
	key := keyOf(t, status.Link)

	held, err := shared.host.State(context.Background(), status.SessionID)
	if err != nil {
		t.Fatalf("read the state: %v", err)
	}

	state := openedState(t, key, status.SessionID, held.Sealed)

	shared.host.state = func(held domain.SealedState) (domain.SealedState, error) {
		return domain.SealedState{
			Sealed:   sealedWith(t, key, "rrd-analyzer/1/"+status.SessionID+"/state", plaintext(state)),
			Revision: domain.Revision{Number: held.Revision.Number + 1, ExpiresAt: held.Revision.ExpiresAt},
		}, nil
	}

	return shared, joined
}

func encoded(t *testing.T, state domain.State) []byte {
	t.Helper()

	plaintext, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("encode the state: %v", err)
	}

	return plaintext
}

func TestRefresh_AStateTheOwnerCouldNotHaveWritten_IsTheServiceFailing(t *testing.T) {
	tests := []struct {
		name          string
		givePlaintext func(t *testing.T, state domain.State) []byte
		wantMessage   string
	}{
		{name: "not JSON", givePlaintext: func(*testing.T, domain.State) []byte { return []byte("not JSON") }, wantMessage: "does not read"},
		{name: "another format", givePlaintext: func(t *testing.T, state domain.State) []byte {
			state.Format = domain.StateFormat + 1

			return encoded(t, state)
		}, wantMessage: "format"},
		{name: "fewer files than followed", givePlaintext: func(t *testing.T, state domain.State) []byte {
			state.Files = state.Files[:1]

			return encoded(t, state)
		}, wantMessage: "fewer files"},
		{name: "a file followed replaced", givePlaintext: func(t *testing.T, state domain.State) []byte {
			state.Files[0].FileID = "another file"

			return encoded(t, state)
		}, wantMessage: "is not the one"},
		{name: "a file of another size", givePlaintext: func(t *testing.T, state domain.State) []byte {
			extra := state.Files[0]
			extra.Size++
			state.Files = append(state.Files, extra)

			return encoded(t, state)
		}, wantMessage: "bytes"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared, joined := joinedOverState(t, func(state domain.State) []byte { return tt.givePlaintext(t, state) })

			_, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID)

			if !errors.Is(err, domain.ErrServiceFailed) || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("err = %v, want the service failing, saying %q", err, tt.wantMessage)
			}
		})
	}
}

func TestRefresh_WhatStopsARefresh_IsReported(t *testing.T) {
	tests := []struct {
		name      string
		giveWorld func(shared *world)
		wantErr   error
	}{
		{name: "a session that ended", giveWorld: func(shared *world) {
			shared.server.Expire(onlySessionOf(shared))
		}, wantErr: domain.ErrSessionEnded},
		{name: "a file that cannot be downloaded", giveWorld: func(shared *world) {
			shared.owner.library.grow(ownedAnalysis, diskSource)
			publish(shared)
			shared.host.chunk = func(string, int, []byte) ([]byte, error) { return nil, errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
		{name: "a library that cannot add the file", giveWorld: func(shared *world) {
			shared.owner.library.grow(ownedAnalysis, diskSource)
			publish(shared)
			shared.viewer.library.failing = addSourcesOperation
		}, wantErr: errLibraryUnavailable},
		{name: "a library that cannot arrange", giveWorld: func(shared *world) {
			publish(shared)
			shared.viewer.library.failing = arrangeOperation
		}, wantErr: errLibraryUnavailable},
		{name: "a log that cannot be downloaded", giveWorld: func(shared *world) {
			if _, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, withLog("a new log")); err != nil {
				panic(err)
			}

			shared.host.chunk = func(string, int, []byte) ([]byte, error) { return nil, errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			joined := shared.joined(t, shared.started(t))
			tt.giveWorld(shared)

			if _, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestRefresh_AFileAddedThenAnArrangementRefused_IsNotAddedTwice(t *testing.T) {
	shared := newWorld(t)
	joined := shared.joined(t, shared.started(t))
	shared.owner.library.grow(ownedAnalysis, diskSource)
	publish(shared)
	shared.viewer.library.failing = arrangeOperation

	if _, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID); !errors.Is(err, errLibraryUnavailable) {
		t.Fatalf("err = %v, want %v", err, errLibraryUnavailable)
	}

	shared.viewer.library.failing = 0

	if _, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID); err != nil {
		t.Fatalf("refresh again: %v", err)
	}

	if viewed := onlyViewedAnalysis(t, shared.viewer.library); len(viewed.Files) != 3 {
		t.Errorf("the viewer's analysis lists %d files, want the added one once", len(viewed.Files))
	}
}

func publish(shared *world) {
	if _, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, withLog(logContent)); err != nil {
		panic(err)
	}
}

func onlySessionOf(shared *world) string {
	session, err := shared.owner.registry.Get(context.Background(), ownedAnalysis)
	if err != nil {
		panic(err)
	}

	return session.SessionID
}

func TestRefresh_AChunkSealedForAnotherFile_IsTheServiceFailing(t *testing.T) {
	var stateFiles []domain.StateFile

	shared, joined := joinedOverState(t, func(state domain.State) []byte {
		stateFiles = state.Files
		state.Files = append(state.Files, state.Files[0])

		return encoded(t, state)
	})

	shared.host.chunk = func(_ string, index int, _ []byte) ([]byte, error) {
		return shared.host.Host.Chunk(context.Background(), joined.SessionID, stateFiles[1].FileID, index)
	}

	_, err := shared.viewer.service.Refresh(context.Background(), joined.SessionID)

	if !errors.Is(err, domain.ErrServiceFailed) || !strings.Contains(err.Error(), "does not open") {
		t.Errorf("err = %v, want the chunk refused as not the session's", err)
	}
}
