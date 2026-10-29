package surface_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
)

var errRegistryUnavailable = errors.New("the registry cannot be reached")

// unreadableRegistry is a registry that cannot say which analyses are live.
type unreadableRegistry struct {
	*sharingInfra.MemoryRegistry
}

func (unreadableRegistry) Get(context.Context, string) (sharingDomain.OwnedSession, error) {
	return sharingDomain.OwnedSession{}, errRegistryUnavailable
}

// sharingOperations is the surface publishing to service, with its live sessions kept in sessions.
func sharingOperations(t *testing.T, service *sharetest.Server, sessions sharingDomain.Registry) *surface.Operations {
	t.Helper()

	wiring := completeWiring()
	wiring.Sharing = surface.SharingWiring{ServiceURL: service.URL(), Sessions: sessions}

	return surface.Build(wiring)
}

func liveAnalysis(t *testing.T, operations *surface.Operations) (surface.AnalysisView, surface.SessionStatus) {
	t.Helper()

	source := filepath.Join(t.TempDir(), "queue_depth.xml")
	if err := os.WriteFile(source, []byte(builtDump), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	created, err := operations.CreateAnalysis(context.Background(), "Queues", []surface.FileInfo{{Name: "queue_depth.xml", Path: source}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	status, err := operations.StartSession(context.Background(), created.ID, surface.SessionPublication{})
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	return created, status
}

func TestSessions_AnOwnersWholeSession_GoesThroughTheSurface(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	operations := sharingOperations(t, service, sharingInfra.NewMemoryRegistry())
	created, started := liveAnalysis(t, operations)
	callerContext := context.Background()

	published, err := operations.PublishSession(callerContext, created.ID, surface.SessionPublication{})
	if err != nil || published.Revision != started.Revision+1 {
		t.Fatalf("publish = %+v, %v; want the next revision", published, err)
	}

	if status, err := operations.SessionStatus(callerContext, created.ID); err != nil || status.SessionID != started.SessionID {
		t.Fatalf("status = %+v, %v; want the session started", status, err)
	}

	if listed, err := operations.ListSessions(callerContext); err != nil || len(listed) != 1 {
		t.Fatalf("list = %+v, %v; want the one session", listed, err)
	}

	if err := operations.EndSession(callerContext, created.ID); err != nil || service.Holds(started.SessionID) {
		t.Fatalf("end = %v, held %v; want the session ended at the service", err, service.Holds(started.SessionID))
	}

	if !operations.Build().SharesSessions {
		t.Error("the build says it shares no sessions, want it to with a share service")
	}
}

func TestSessions_WhereNoFileCanBeKeptInMemory_FollowingIsUnavailable(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	operations := sharingOperations(t, service, sharingInfra.NewMemoryRegistry())
	callerContext := context.Background()

	_, joinErr := operations.JoinSession(callerContext, "session", "key")
	_, refreshErr := operations.RefreshSession(callerContext, "session")
	forgetErr := operations.ForgetSession(callerContext, "session")

	for _, err := range []error{joinErr, refreshErr, forgetErr} {
		if !errors.Is(err, sharingDomain.ErrViewingUnavailable) {
			t.Errorf("err = %v, want %v", err, sharingDomain.ErrViewingUnavailable)
		}
	}
}

func TestDeleteAnalysis_ALiveAnalysis_EndsItsSessionFirst(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	operations := sharingOperations(t, service, sharingInfra.NewMemoryRegistry())
	created, started := liveAnalysis(t, operations)

	if err := operations.DeleteAnalysis(context.Background(), created.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if service.Holds(started.SessionID) {
		t.Error("the service still holds the session of the deleted analysis, want it ended")
	}
}

func TestDeleteAnalysis_ARegistryThatCannotSayWhatIsLive_KeepsTheAnalysis(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	operations := sharingOperations(t, service, unreadableRegistry{MemoryRegistry: sharingInfra.NewMemoryRegistry()})

	created, err := operations.CreateAnalysis(context.Background(), "Queues", []surface.FileInfo{{Name: "queue_depth.xml", Path: "/srv/queue_depth.xml"}})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := operations.DeleteAnalysis(context.Background(), created.ID); !errors.Is(err, errRegistryUnavailable) {
		t.Fatalf("delete = %v, want %v", err, errRegistryUnavailable)
	}

	if listed, _ := operations.ListAnalyses(context.Background()); len(listed) != 1 {
		t.Errorf("the library holds %d analyses, want the one whose session could not be ended", len(listed))
	}

}
