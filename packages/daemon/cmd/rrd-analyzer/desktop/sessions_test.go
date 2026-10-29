package desktop

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/sharetest"
)

// sharingAPIOver is an API whose surface publishes to service.
func sharingAPIOver(t *testing.T, service *sharetest.Server) *API {
	t.Helper()

	windowDialogs := newDialogs(&nativeStandIn{}, analysisInfra.NewSourceDescriber())

	return NewAPI(surface.Build(surface.Wiring{
		Store:                  analysisInfra.NewMemoryStore(),
		SearchHistory:          searchesInfra.NewMemoryStore(),
		Files:                  surface.DiskSourceFiles(),
		ConfigurationDirectory: t.TempDir(),
		Picker:                 windowDialogs,
		SaveTargets:            windowDialogs,
		Writer:                 exportInfra.NewFileWriter(),
		Sharing:                surface.SharingWiring{ServiceURL: service.URL(), Sessions: sharingInfra.NewMemoryRegistry()},
	}), windowDialogs)
}

func TestAPI_ALiveSession_IsStartedPublishedAndEndedThroughTheBindings(t *testing.T) {
	service := sharetest.NewServer()
	t.Cleanup(service.Close)

	api := sharingAPIOver(t, service)
	created := createdOver(t, api, writtenDump(t, "cpu.xml"))

	started, err := api.StartSession(created.ID, surface.SessionPublication{})
	if err != nil || len(started.Files) != 1 || !started.Files[0].Online {
		t.Fatalf("start = %+v, %v; want the one file online", started, err)
	}

	if published, err := api.PublishSession(created.ID, surface.SessionPublication{}); err != nil || published.Revision != started.Revision+1 {
		t.Fatalf("publish = %+v, %v; want the next revision", published, err)
	}

	if status, err := api.SessionStatus(created.ID); err != nil || status.Link != started.Link {
		t.Fatalf("status = %+v, %v; want the link started", status, err)
	}

	if listed, err := api.ListSessions(); err != nil || len(listed) != 1 {
		t.Fatalf("list = %+v, %v; want the one session", listed, err)
	}

	if err := api.EndSession(created.ID); err != nil || service.Holds(started.SessionID) {
		t.Errorf("end = %v, held %v; want the session ended at the service", err, service.Holds(started.SessionID))
	}
}
