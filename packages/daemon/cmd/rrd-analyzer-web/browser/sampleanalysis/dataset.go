// Package sampleanalysis is the analysis the browser edition opens with: two weeks of a made-up HTTP API's
// metrics, written as the rrdtool dumps a person would open, and the log the service wrote over the
// same weeks. Every number is generated from fixed seeds, so the sample reads the same on every visit
// and in every test, and nothing in it was ever measured anywhere.
//
// The weeks hold four incidents, each shaped for an insight to find: a partner's bulk import that
// saturates the processor, a deployment that restarts the service, a memory leak that ends with the
// kernel killing it, and a latency that drifts past its objective.
package sampleanalysis

import (
	"fmt"
	"slices"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/metricname"
)

const (
	Name        = "Sample API · production"
	LogFileName = "sample-api.ndjson"
)

const (
	requestsFile      = "api_http_requests.xml"
	latencyFile       = "api_http_latency_p95_ms.xml"
	cpuUserFile       = "api_system_cpu_user_percent.xml"
	cpuSystemFile     = "api_system_cpu_system_percent.xml"
	loadFile          = "api_system_load_1min.xml"
	memoryUsedFile    = "api_system_memory_used_bytes.xml"
	heapObjectsFile   = "api_runtime_heap_objects.xml"
	gcPauseFile       = "api_runtime_gc_pause_ms.xml"
	uptimeFile        = "api_application_uptime_seconds.xml"
	networkFile       = "api_system_network_received_bytes.xml"
	sharedAxis        = 0
	missingFromSample = -1
)

// File is one file of the sample, as a person would have opened it.
type File struct {
	Name    string
	Content []byte
}

// Dataset is the whole sample: the sources of the analysis, in the order it lists them, the charts
// it opens on, and the service's log.
type Dataset struct {
	Sources []File
	Canvas  []analysisDomain.CanvasChart
	Log     File
}

// openingChart is a chart the sample opens on, named by the files its series come from.
type openingChart struct {
	fileName string
	merged   []string
}

// openingCanvas is the traffic, the processor with its system time drawn over the user time, the
// memory the leak climbs, and the latency that drifts.
var openingCanvas = []openingChart{
	{fileName: requestsFile},
	{fileName: cpuUserFile, merged: []string{cpuSystemFile}},
	{fileName: memoryUsedFile},
	{fileName: latencyFile},
}

func Generate() (Dataset, error) {
	readings := recorded()

	sources := make([]File, 0, len(metrics))
	for _, source := range metrics {
		sources = append(sources, File{Name: source.fileName, Content: dumpOf(source, readings[source.fileName])})
	}

	canvas, err := canvasOf(openingCanvas)
	if err != nil {
		return Dataset{}, err
	}

	log, err := logOf(readings)
	if err != nil {
		return Dataset{}, fmt.Errorf("write the sample log: %w", err)
	}

	return Dataset{Sources: sources, Canvas: canvas, Log: File{Name: LogFileName, Content: log}}, nil
}

// canvasOf names each chart's series the way the analysis will: by the position of its file among
// the sources, since each file holds one series, and by the label the parser gives it.
func canvasOf(charts []openingChart) ([]analysisDomain.CanvasChart, error) {
	canvas := make([]analysisDomain.CanvasChart, 0, len(charts))

	for _, chart := range charts {
		seriesID, label, err := seriesOf(chart.fileName)
		if err != nil {
			return nil, err
		}

		merged := make([]analysisDomain.MergedSeries, 0, len(chart.merged))
		for _, fileName := range chart.merged {
			mergedID, mergedLabel, err := seriesOf(fileName)
			if err != nil {
				return nil, err
			}

			merged = append(merged, analysisDomain.MergedSeries{SeriesID: mergedID, Label: mergedLabel, Axis: sharedAxis})
		}

		canvas = append(canvas, analysisDomain.CanvasChart{SeriesID: seriesID, Label: label, Merged: merged})
	}

	return canvas, nil
}

func seriesOf(fileName string) (string, string, error) {
	position := slices.IndexFunc(metrics, func(source metric) bool { return source.fileName == fileName })
	if position == missingFromSample {
		return "", "", fmt.Errorf("chart the sample opens on: %q is none of its sources", fileName)
	}

	return analysisUsecase.SeriesIDAt(position), metricname.LabelOf(metricname.RootOf(fileName)), nil
}
