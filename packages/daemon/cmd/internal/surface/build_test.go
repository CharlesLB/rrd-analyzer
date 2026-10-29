package surface_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
)

// completeWiring is every port Build needs, kept in memory, for a test to take one away from.
func completeWiring() surface.Wiring {
	picker := &savePicker{}

	return surface.Wiring{
		Store:         analysisInfra.NewMemoryStore(),
		SearchHistory: searchesInfra.NewMemoryStore(),
		Files:         surface.DiskSourceFiles(),
		Picker:        picker,
		SaveTargets:   picker,
		Writer:        exportInfra.NewFileWriter(),
		Sharing:       surface.SharingWiring{Sessions: sharingInfra.NewMemoryRegistry()},
	}
}

func TestBuild_MissingPort_PanicsNamingTheWire(t *testing.T) {
	tests := []struct {
		name       string
		giveWiring func(wiring *surface.Wiring)
	}{
		{name: "no store", giveWiring: func(wiring *surface.Wiring) { wiring.Store = nil }},
		{name: "no search history", giveWiring: func(wiring *surface.Wiring) { wiring.SearchHistory = nil }},
		{name: "no file picker", giveWiring: func(wiring *surface.Wiring) { wiring.Picker = nil }},
		{name: "no save target picker", giveWiring: func(wiring *surface.Wiring) { wiring.SaveTargets = nil }},
		{name: "no writer", giveWiring: func(wiring *surface.Wiring) { wiring.Writer = nil }},
		{name: "no source loader", giveWiring: func(wiring *surface.Wiring) { wiring.Files.Loader = nil }},
		{name: "no source presence check", giveWiring: func(wiring *surface.Wiring) { wiring.Files.Presence = nil }},
		{name: "no source reader", giveWiring: func(wiring *surface.Wiring) { wiring.Files.Reader = nil }},
		{name: "no live session registry", giveWiring: func(wiring *surface.Wiring) { wiring.Sharing.Sessions = nil }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wiring := completeWiring()
			tt.giveWiring(&wiring)

			defer func() {
				if recover() == nil {
					t.Error("Build went through, want a panic naming the missing wire")
				}
			}()

			surface.Build(wiring)
		})
	}
}
