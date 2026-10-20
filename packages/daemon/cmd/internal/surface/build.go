package surface

import (
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
	exportUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/usecase"
	insightsInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/infrastructure"
	insightsUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	rrdInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/infrastructure"
	searchesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/domain"
	searchesUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/usecase"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/clock"
)

// Wiring is the part of the application the binaries do not share: where the library is kept,
// where the source files are and how they become series, where a person's overrides are read from,
// and the halves only a native window has. Every field but ConfigurationDirectory is required; an
// empty directory runs the built-in rules and units.
type Wiring struct {
	Store                  analysisDomain.Store
	SearchHistory          searchesDomain.Store
	Files                  SourceFiles
	ConfigurationDirectory string
	Picker                 FilePicker
	SaveTargets            exportDomain.SaveTargetPicker
	Writer                 exportDomain.Writer
}

// SourceFiles is where the files an analysis names are kept, through the three ways the application
// reaches them: reading their series, looking for them, and copying them out byte for byte. The
// desktop window and the development server keep them on disk; the browser edition keeps them in
// the memory of the tab, since a browser hands a page the content of a file and never its path.
type SourceFiles struct {
	Loader   analysisDomain.SourceLoader
	Presence analysisDomain.SourcePresence
	Reader   exportDomain.SourceReader
}

// Build wires every port to its adapter, once for every binary. The desktop window and the
// development server used to wire this graph each on its own, and an option given to one service in
// one of them was then silently missing from the other; whatever is not in Wiring is now the same
// in all of them by construction.
func Build(wiring Wiring) *Operations {
	if wiring.Store == nil || wiring.SearchHistory == nil || wiring.Picker == nil || wiring.SaveTargets == nil || wiring.Writer == nil {
		panic("surface: the store, the search history, the file picker, the save target picker and the writer are all required")
	}

	if wiring.Files.Loader == nil || wiring.Files.Presence == nil || wiring.Files.Reader == nil {
		panic("surface: the source files need a loader, a presence check and a reader")
	}

	analyses := analysisUsecase.NewService(
		wiring.Store,
		wiring.Files.Loader,
		clock.New(),
		analysisUsecase.WithUnitRules(analysisInfra.NewUnitRulesLoader(wiring.ConfigurationDirectory)),
		analysisUsecase.WithSourcePresence(wiring.Files.Presence),
	)
	exportSource := analysisUsecase.NewExportSource(analyses)

	return New(Dependencies{
		Analyses: analyses,
		Insights: insightsUsecase.NewService(
			analysisUsecase.NewInsightsSource(analyses),
			insightsInfra.NewConfigurationLoader(wiring.ConfigurationDirectory),
		),
		Exports: exportUsecase.NewService(exportUsecase.Dependencies{
			Source:  exportSource,
			Library: exportSource,
			Reader:  wiring.Files.Reader,
			Format:  rrdInfra.NewSourceFormat(),
			Picker:  wiring.SaveTargets,
			Writer:  wiring.Writer,
		}),
		Searches: searchesUsecase.NewService(wiring.SearchHistory),
		Sources:  analysisInfra.NewSourceDescriber(),
		Picker:   wiring.Picker,
	})
}

// DiskSourceFiles reaches sources on disk, the way the desktop window and the development server
// do.
func DiskSourceFiles() SourceFiles {
	return SourceFiles{
		Loader:   analysisInfra.NewSourceLoader(rrdInfra.NewSeriesReader(rrdInfra.NewDumpReader())),
		Presence: analysisInfra.NewSourcePresence(),
		Reader:   exportInfra.NewFileReader(),
	}
}
