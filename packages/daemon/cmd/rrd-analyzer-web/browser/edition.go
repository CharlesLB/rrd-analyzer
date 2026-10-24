// Package browser is the composition root of the browser edition: the whole application surface,
// with the library, the search history and every file a person opens kept in the memory of the tab,
// and nothing written anywhere. The page reaches it through the same HTTP routes the development
// server answers, served in process rather than over a network, so the frontend speaks one protocol
// to both.
package browser

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/httpsurface"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer-web/browser/sampleanalysis"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	rrdInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/infrastructure"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/memoryfiles"
)

// noConfigurationDirectory runs the built-in insights rules and units: a browser has no folder of
// overrides to read them from.
const noConfigurationDirectory = ""

// Edition is the application as one browser tab runs it.
type Edition struct {
	files    *memoryfiles.Files
	handler  http.Handler
	requests *requestRegistry
}

// New builds the edition and opens its library on the sample analysis, so a visitor has something
// to explore before opening a file of their own. now is the moment the sample counts as opened.
func New(callerContext context.Context, now time.Time) (*Edition, error) {
	return newEdition(callerContext, now, sampleanalysis.Generate)
}

// newEdition builds the edition over the sample generateSample writes.
func newEdition(callerContext context.Context, now time.Time, generateSample sampleGenerator) (*Edition, error) {
	files := memoryfiles.New()

	operations := surface.Build(surface.Wiring{
		Store:                  analysisInfra.NewMemoryStore(),
		SearchHistory:          searchesInfra.NewMemoryStore(),
		Files:                  memorySourceFiles(files),
		ConfigurationDirectory: noConfigurationDirectory,
		Picker:                 httpsurface.UnavailableDialogs{},
		SaveTargets:            httpsurface.UnavailableDialogs{},
		Writer:                 httpsurface.UnavailableDialogs{},
	})

	sampleAnswer, err := seedSampleAnalysis(callerContext, operations, files, generateSample, now)
	if err != nil {
		return nil, fmt.Errorf("open the sample analysis: %w", err)
	}

	routes := httpsurface.Routes(operations)
	routes.HandleFunc(sampleAnalysisRoute, serveSampleAnalysis(sampleAnswer))

	return &Edition{files: files, handler: routes, requests: newRequestRegistry()}, nil
}

// Keep holds a file the page read, and answers with the path an analysis names it by.
func (edition *Edition) Keep(name string, content []byte) string {
	return edition.files.Keep(name, content)
}

// memorySourceFiles reaches the files kept in the tab, the sample's among them.
func memorySourceFiles(files *memoryfiles.Files) surface.SourceFiles {
	return surface.SourceFiles{
		Loader:   analysisInfra.NewSourceLoader(rrdInfra.NewSeriesReader(rrdInfra.NewDumpReaderOver(files))),
		Presence: files,
		Reader:   files,
	}
}
