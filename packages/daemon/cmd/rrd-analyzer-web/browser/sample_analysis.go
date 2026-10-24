package browser

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer-web/browser/sampleanalysis"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/memoryfiles"
)

// sampleAnalysisRoute is where the page asks which analysis is the sample and for the log that goes
// with it. Logs never reach the core, which only reads RRD sources: the page reads a log itself, so
// the sample hands its log over for the page to open the way it opens one a person drops.
const sampleAnalysisRoute = "GET /api/sample-analysis"

// sampleGenerator writes the sample analysis: its sources, the charts it opens on and its log.
type sampleGenerator func() (sampleanalysis.Dataset, error)

type sampleAnalysisView struct {
	AnalysisID string  `json:"analysisId"`
	Log        logView `json:"log"`
}

type logView struct {
	FileName string `json:"fileName"`
	Content  string `json:"content"`
}

// seedSampleAnalysis opens the library on the sample analysis. Its sources are kept in the tab like any file
// a person opens, so the sample is read, charted and copied exactly the way their own files are.
// It answers with what the sample analysis route serves, encoded once: the log is a hundred kilobytes that
// never change.
//
// The view is strings, which JSON always encodes, so the error encoding it hands back is nil for every
// sample and is not passed on.
func seedSampleAnalysis(callerContext context.Context, operations *surface.Operations, files *memoryfiles.Files, generateSample sampleGenerator, now time.Time) ([]byte, error) {
	dataset, err := generateSample()
	if err != nil {
		return nil, fmt.Errorf("generate the sample analysis: %w", err)
	}

	sources := make([]surface.FileInfo, 0, len(dataset.Sources))
	for _, source := range dataset.Sources {
		sources = append(sources, surface.FileInfo{Name: source.Name, Path: files.Keep(source.Name, source.Content), Size: int64(len(source.Content))})
	}

	created, err := operations.CreateSeededAnalysis(callerContext, surface.SeededAnalysis{
		Name:         sampleanalysis.Name,
		Files:        sources,
		LastAccessed: now,
		Canvas:       dataset.Canvas,
	})
	if err != nil {
		return nil, fmt.Errorf("create %q: %w", sampleanalysis.Name, err)
	}

	view, _ := json.Marshal(sampleAnalysisView{AnalysisID: created.ID, Log: logView{FileName: dataset.Log.Name, Content: string(dataset.Log.Content)}})

	return view, nil
}

func serveSampleAnalysis(view []byte) http.HandlerFunc {
	return func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", jsonContentType)
		if _, err := writer.Write(view); err != nil {
			log.Println("write the sample analysis:", err)
		}
	}
}
