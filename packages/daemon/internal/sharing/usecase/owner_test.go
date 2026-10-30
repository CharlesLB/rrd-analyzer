package usecase_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
)

func TestStart_AnAnalysis_PutsEveryFileOnlineBehindALinkToTheWebApp(t *testing.T) {
	shared := newWorld(t)

	status := shared.started(t)

	wantFiles := []domain.FileStatus{{Name: "cpu.rrd", Path: "/srv/cpu.rrd", Online: true}, {Name: "memory.rrd", Path: "/srv/memory.rrd", Online: true}}
	if status.AnalysisID != ownedAnalysis || status.Revision != 1 || !reflect.DeepEqual(status.Files, wantFiles) ||
		!reflect.DeepEqual(status.Log, &domain.LogStatus{Name: logName, Online: true}) {
		t.Errorf("status = %+v, want revision 1 with both files and the log online", status)
	}

	if !strings.HasPrefix(status.Link, shared.server.URL()+sharetest.LinkRoute+status.SessionID+"/") || status.ExpiresAtMilliseconds != shared.server.ExpiresAt().UnixMilli() {
		t.Errorf("link = %q ending at %d, want the web app's route on the service, ending when the service says", status.Link, status.ExpiresAtMilliseconds)
	}
}

func TestStart_AnAnalysisAlreadyLive_PublishesOntoTheSameSession(t *testing.T) {
	shared := newWorld(t)
	first := shared.started(t)

	again, err := shared.owner.service.Start(context.Background(), ownedAnalysis, domain.Publication{})
	if err != nil {
		t.Fatalf("start again: %v", err)
	}

	if again.Link != first.Link || again.Revision != 2 || again.Log != nil {
		t.Errorf("started again = %+v, want the same link at revision 2 with the log gone", again)
	}
}

func TestStart_ASessionTheServiceEnded_IsReplacedByANewOne(t *testing.T) {
	shared := newWorld(t)
	first := shared.started(t)
	shared.server.Expire(first.SessionID)

	again := shared.started(t)

	if again.SessionID == first.SessionID || again.Revision != 1 {
		t.Errorf("started again = %+v, want a new session at revision 1", again)
	}
}

func TestStart_AFirstPublicationThatFails_LeavesNothingLive(t *testing.T) {
	shared := newWorld(t)
	shared.server.LimitSessionBytes(len("RRD cpu") + nonceBytes + 16)

	_, err := shared.owner.service.Start(context.Background(), ownedAnalysis, domain.Publication{})

	if !errors.Is(err, domain.ErrTooLarge) {
		t.Fatalf("err = %v, want %v", err, domain.ErrTooLarge)
	}

	if listed, _ := shared.owner.registry.List(context.Background()); len(listed) != 0 {
		t.Errorf("the registry holds %+v, want nothing live", listed)
	}
}

func TestStart_WhatStopsAStart_IsReported(t *testing.T) {
	tests := []struct {
		name         string
		giveWorld    func(shared *world)
		giveAnalysis string
		wantErr      error
	}{
		{name: "an analysis that is gone", giveWorld: func(*world) {}, giveAnalysis: "gone", wantErr: analysisDomain.ErrAnalysisNotFound},
		{name: "a registry that cannot be read", giveWorld: func(shared *world) {
			shared.owner.registry.failing = getRegistryOperation
		}, giveAnalysis: ownedAnalysis, wantErr: errRegistryUnavailable},
		{name: "a service refusing new sessions", giveWorld: func(shared *world) {
			shared.server.RefuseNewSessions()
		}, giveAnalysis: ownedAnalysis, wantErr: domain.ErrServiceBusy},
		{name: "a registry that cannot keep the session", giveWorld: func(shared *world) {
			shared.owner.registry.failingSave = 1
		}, giveAnalysis: ownedAnalysis, wantErr: errRegistryUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			tt.giveWorld(shared)

			if _, err := shared.owner.service.Start(context.Background(), tt.giveAnalysis, domain.Publication{}); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestPublish_ANewFile_IsTheOnlyOneUploaded(t *testing.T) {
	shared := newWorld(t)
	shared.started(t)
	uploadedAtStart := shared.host.putChunks
	shared.owner.library.grow(ownedAnalysis, diskSource)

	status, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, withLog(logContent))
	if err != nil {
		t.Fatalf("publish: %v", err)
	}

	if uploaded := shared.host.putChunks - uploadedAtStart; uploaded != 1 || status.Revision != 2 || len(status.Files) != 3 || !status.Files[2].Online {
		t.Errorf("uploaded %d chunks to reach %+v, want the one new file uploaded and online at revision 2", uploaded, status)
	}
}

func TestPublish_TheLog_IsUploadedOnlyWhenItChanges(t *testing.T) {
	tests := []struct {
		name         string
		givePublish  domain.Publication
		wantUploaded int
		wantLog      *domain.LogStatus
	}{
		{name: "the same content", givePublish: withLog(logContent), wantUploaded: 0, wantLog: &domain.LogStatus{Name: logName, Online: true}},
		{name: "no content", givePublish: domain.Publication{Log: &domain.PublishedLog{Name: logName}}, wantUploaded: 0, wantLog: &domain.LogStatus{Name: logName, Online: true}},
		{name: "new content", givePublish: withLog(logContent + "\n"), wantUploaded: 1, wantLog: &domain.LogStatus{Name: logName, Online: true}},
		{name: "no log", givePublish: domain.Publication{}, wantUploaded: 0, wantLog: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			shared.started(t)
			uploadedAtStart := shared.host.putChunks

			status, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, tt.givePublish)
			if err != nil {
				t.Fatalf("publish: %v", err)
			}

			if uploaded := shared.host.putChunks - uploadedAtStart; uploaded != tt.wantUploaded || !reflect.DeepEqual(status.Log, tt.wantLog) {
				t.Errorf("uploaded %d chunks, log %+v; want %d, %+v", uploaded, status.Log, tt.wantUploaded, tt.wantLog)
			}
		})
	}
}

func TestPublish_APublicationThatCannotBeMade_IsRefused(t *testing.T) {
	renamedWithoutContent := domain.Publication{Log: &domain.PublishedLog{Name: "other.log"}}
	invalidView := domain.Publication{Log: &domain.PublishedLog{Name: logName, View: []byte("{not JSON")}}

	tests := []struct {
		name        string
		givePublish domain.Publication
		giveWorld   func(shared *world)
		wantErr     error
	}{
		{name: "a log the session never held, without content", givePublish: renamedWithoutContent, giveWorld: func(*world) {}, wantErr: domain.ErrLogContentMissing},
		{name: "a log's view that is not JSON", givePublish: invalidView, giveWorld: func(*world) {}, wantErr: domain.ErrLogViewInvalid},
		{name: "a source with no path", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.owner.library.grow(ownedAnalysis, analysisDomain.SourceFile{Name: "dropped.rrd"})
		}, wantErr: domain.ErrSourceUnlocated},
		{name: "a source that cannot be read", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.owner.library.grow(ownedAnalysis, analysisDomain.SourceFile{Name: "moved.rrd", Path: "/srv/moved.rrd"})
		}, wantErr: domain.ErrSourceUnreadable},
		{name: "a file that is not a source", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.content["/home/someone/.ssh/id_ed25519"] = []byte("PRIVATE KEY")
			shared.owner.library.grow(ownedAnalysis, analysisDomain.SourceFile{Name: "id_ed25519", Path: "/home/someone/.ssh/id_ed25519"})
		}, wantErr: domain.ErrNotASource},
		{name: "an analysis the library cannot read", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.owner.library.failing = analysisOperation
		}, wantErr: errLibraryUnavailable},
		{name: "a file that cannot be uploaded", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.owner.library.grow(ownedAnalysis, diskSource)
			shared.host.putChunk = func(string, int, []byte) error { return errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
		{name: "a log that cannot be uploaded", givePublish: withLog("a new log"), giveWorld: func(shared *world) {
			shared.host.putChunk = func(string, int, []byte) error { return errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
		{name: "a state that cannot be published", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.host.putState = func([]byte) (domain.Revision, error) { return domain.Revision{}, errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
		{name: "a file online the registry cannot record", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.owner.library.grow(ownedAnalysis, diskSource)
			shared.owner.registry.failingSave = shared.owner.registry.saves + 1
		}, wantErr: errRegistryUnavailable},
		{name: "a log online the registry cannot record", givePublish: withLog("a new log"), giveWorld: func(shared *world) {
			shared.owner.registry.failingSave = shared.owner.registry.saves + 1
		}, wantErr: errRegistryUnavailable},
		{name: "a state published the registry cannot record", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			shared.owner.registry.failingSave = shared.owner.registry.saves + 1
		}, wantErr: errRegistryUnavailable},
		{name: "a session whose stored key was cut short", givePublish: domain.Publication{}, giveWorld: func(shared *world) {
			session, _ := shared.owner.registry.Get(context.Background(), ownedAnalysis)
			session.Key = session.Key[:5]
			_ = shared.owner.registry.Save(context.Background(), session)
		}, wantErr: domain.ErrKeyRefused},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			shared.started(t)
			tt.giveWorld(shared)

			if _, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, tt.givePublish); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestPublish_ASessionTheServiceEnded_IsForgotten(t *testing.T) {
	tests := []struct {
		name        string
		giveForget  bool
		wantErr     error
		wantForgets bool
	}{
		{name: "forgotten", wantErr: domain.ErrSessionEnded, wantForgets: true},
		{name: "a registry that cannot forget", giveForget: true, wantErr: errRegistryUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			status := shared.started(t)
			shared.server.Expire(status.SessionID)

			if tt.giveForget {
				shared.owner.registry.failing = forgetRegistryOperation
			}

			_, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, domain.Publication{})

			if !errors.Is(err, domain.ErrSessionEnded) || !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want the session ended and %v", err, tt.wantErr)
			}

			if _, err := shared.owner.registry.Get(context.Background(), ownedAnalysis); errors.Is(err, domain.ErrNotLive) != tt.wantForgets {
				t.Errorf("forgotten = %v, want %v", errors.Is(err, domain.ErrNotLive), tt.wantForgets)
			}
		})
	}
}

func TestPublish_AnAnalysisNotLive_IsNotLive(t *testing.T) {
	shared := newWorld(t)

	if _, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, domain.Publication{}); !errors.Is(err, domain.ErrNotLive) {
		t.Errorf("err = %v, want %v", err, domain.ErrNotLive)
	}
}

func TestStatus_ASessionSomeoneOpened_EndsWhereTheServiceSaysNow(t *testing.T) {
	shared := newWorld(t)
	shared.started(t)
	renewed := domain.Revision{Number: 1, ExpiresAt: shared.server.ExpiresAt().Add(30 * time.Minute)}
	shared.host.status = func() (domain.Revision, error) { return renewed, nil }

	status, err := shared.owner.service.Status(context.Background(), ownedAnalysis)
	if err != nil {
		t.Fatalf("status: %v", err)
	}

	kept, _ := shared.owner.registry.Get(context.Background(), ownedAnalysis)
	if status.ExpiresAtMilliseconds != renewed.ExpiresAt.UnixMilli() || !kept.ExpiresAt.Equal(renewed.ExpiresAt) {
		t.Errorf("status ends at %d and the registry at %v, want both at the service's new end", status.ExpiresAtMilliseconds, kept.ExpiresAt)
	}
}

func TestStatus_WhatStopsAStatus_IsReported(t *testing.T) {
	tests := []struct {
		name      string
		giveWorld func(shared *world, status domain.Status)
		wantErr   error
	}{
		{name: "an analysis never shared", giveWorld: func(shared *world, _ domain.Status) {
			shared.owner.registry.forgetOwned(ownedAnalysis)
		}, wantErr: domain.ErrNotLive},
		{name: "a session the service ended", giveWorld: func(shared *world, status domain.Status) {
			shared.server.Expire(status.SessionID)
		}, wantErr: domain.ErrSessionEnded},
		{name: "a service that cannot be reached", giveWorld: func(shared *world, _ domain.Status) {
			shared.host.status = func() (domain.Revision, error) { return domain.Revision{}, errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
		{name: "a registry that cannot renew", giveWorld: func(shared *world, _ domain.Status) {
			shared.owner.registry.failing = renewRegistryOperation
		}, wantErr: errRegistryUnavailable},
		{name: "a library that cannot be read", giveWorld: func(shared *world, _ domain.Status) {
			shared.owner.library.failing = analysisOperation
		}, wantErr: errLibraryUnavailable},
		{name: "an analysis deleted meanwhile", giveWorld: func(shared *world, _ domain.Status) {
			delete(shared.owner.library.analyses, ownedAnalysis)
		}, wantErr: analysisDomain.ErrAnalysisNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			tt.giveWorld(shared, shared.started(t))

			if _, err := shared.owner.service.Status(context.Background(), ownedAnalysis); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestList_SessionsThatEnded_AreForgottenOnTheWay(t *testing.T) {
	shared := newWorld(t)
	ended := shared.started(t)
	shared.owner.library.analyses["second"] = analysisDomain.Analysis{ID: "second", Name: "Second", Files: []analysisDomain.SourceFile{diskSource}}
	shared.owner.library.analyses["deleted"] = analysisDomain.Analysis{ID: "deleted", Name: "Deleted", Files: []analysisDomain.SourceFile{diskSource}}

	for _, analysisID := range []string{"second", "deleted"} {
		if _, err := shared.owner.service.Start(context.Background(), analysisID, domain.Publication{}); err != nil {
			t.Fatalf("start %q: %v", analysisID, err)
		}
	}

	deleted, _ := shared.owner.registry.Get(context.Background(), "deleted")
	shared.server.Expire(ended.SessionID)
	delete(shared.owner.library.analyses, "deleted")

	statuses, err := shared.owner.service.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}

	if len(statuses) != 1 || statuses[0].AnalysisID != "second" {
		t.Errorf("listed %+v, want only the session still live over an analysis still there", statuses)
	}

	if shared.server.Holds(deleted.SessionID) {
		t.Error("the service still holds the session of the deleted analysis, want it ended")
	}

	if remembered, _ := shared.owner.registry.List(context.Background()); len(remembered) != 1 {
		t.Errorf("the registry remembers %d sessions, want only the one listed", len(remembered))
	}
}

func TestList_WhatStopsAListing_IsReported(t *testing.T) {
	tests := []struct {
		name      string
		giveWorld func(shared *world)
		wantErr   error
	}{
		{name: "a registry that cannot be listed", giveWorld: func(shared *world) {
			shared.owner.registry.failing = listRegistryOperation
		}, wantErr: errRegistryUnavailable},
		{name: "a service that cannot be reached", giveWorld: func(shared *world) {
			shared.host.status = func() (domain.Revision, error) { return domain.Revision{}, errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			shared.started(t)
			tt.giveWorld(shared)

			if _, err := shared.owner.service.List(context.Background()); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestEnd_ALiveAnalysis_IsEndedAtTheServiceAndLocalAgain(t *testing.T) {
	tests := []struct {
		name      string
		giveWorld func(shared *world, status domain.Status)
	}{
		{name: "a session live", giveWorld: func(*world, domain.Status) {}},
		{name: "a session the service already ended", giveWorld: func(shared *world, status domain.Status) {
			shared.server.Expire(status.SessionID)
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			status := shared.started(t)
			tt.giveWorld(shared, status)

			if err := shared.owner.service.End(context.Background(), ownedAnalysis); err != nil {
				t.Fatalf("end: %v", err)
			}

			if _, err := shared.owner.registry.Get(context.Background(), ownedAnalysis); !errors.Is(err, domain.ErrNotLive) || shared.server.Holds(status.SessionID) {
				t.Errorf("registry says %v and the service holds it %v, want it gone from both", err, shared.server.Holds(status.SessionID))
			}
		})
	}
}

func TestEnd_WhatStopsAnEnd_IsReported(t *testing.T) {
	tests := []struct {
		name      string
		giveWorld func(shared *world)
		wantErr   error
	}{
		{name: "an analysis not live", giveWorld: func(shared *world) {
			shared.owner.registry.forgetOwned(ownedAnalysis)
		}, wantErr: domain.ErrNotLive},
		{name: "a service that cannot be reached", giveWorld: func(shared *world) {
			shared.host.end = func() error { return errHostRefused }
		}, wantErr: domain.ErrServiceFailed},
		{name: "a registry that cannot forget", giveWorld: func(shared *world) {
			shared.owner.registry.failing = forgetRegistryOperation
		}, wantErr: errRegistryUnavailable},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			shared := newWorld(t)
			shared.started(t)
			tt.giveWorld(shared)

			if err := shared.owner.service.End(context.Background(), ownedAnalysis); !errors.Is(err, tt.wantErr) {
				t.Errorf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestRelease_AnAnalysisAboutToBeDeleted_EndsItsSessionEvenIfTheServiceCannotBeReached(t *testing.T) {
	shared := newWorld(t)
	shared.started(t)
	shared.host.end = func() error { return errHostRefused }

	if err := shared.owner.service.Release(context.Background(), ownedAnalysis); err != nil {
		t.Fatalf("release: %v", err)
	}

	if _, err := shared.owner.registry.Get(context.Background(), ownedAnalysis); !errors.Is(err, domain.ErrNotLive) {
		t.Errorf("get after release = %v, want %v", err, domain.ErrNotLive)
	}

	if err := shared.owner.service.Release(context.Background(), ownedAnalysis); err != nil {
		t.Errorf("release of an analysis not live = %v, want nothing to do", err)
	}
}

func TestRelease_ARegistryThatCannotBeRead_IsReported(t *testing.T) {
	shared := newWorld(t)
	shared.owner.registry.failing = getRegistryOperation

	if err := shared.owner.service.Release(context.Background(), ownedAnalysis); !errors.Is(err, errRegistryUnavailable) {
		t.Errorf("err = %v, want %v", err, errRegistryUnavailable)
	}
}

func TestPublish_AFileLongerThanAChunk_IsCutIntoSeveral(t *testing.T) {
	shared := newWorld(t)
	shared.content[diskSource.Path] = append([]byte(sourcePrefix), make([]byte, domain.ChunkBytes)...)
	shared.started(t)
	uploadedAtStart := shared.host.putChunks
	shared.owner.library.grow(ownedAnalysis, diskSource)

	status, err := shared.owner.service.Publish(context.Background(), ownedAnalysis, domain.Publication{})
	if err != nil {
		t.Fatalf("publish: %v", err)
	}

	if uploaded := shared.host.putChunks - uploadedAtStart; uploaded != 2 || !status.Files[2].Online {
		t.Errorf("uploaded %d chunks, want the file of eight mebibytes and four bytes in two", uploaded)
	}

	joined := shared.joined(t, status)
	viewed := onlyViewedAnalysis(t, shared.viewer.library)

	content, err := shared.keeper.Read(context.Background(), viewed.Files[2].Path)
	if err != nil || len(content) != domain.ChunkBytes+len(sourcePrefix) || joined.Revision != status.Revision {
		t.Errorf("the viewer holds %d bytes (%v) at revision %d, want the whole file at %d", len(content), err, joined.Revision, status.Revision)
	}
}
