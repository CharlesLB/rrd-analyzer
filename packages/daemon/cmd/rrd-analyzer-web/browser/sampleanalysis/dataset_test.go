package sampleanalysis_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer-web/browser/sampleanalysis"
	rrdUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const sampleSourceCount = 10

var logLevels = []string{"debug", "info", "warn", "error", "fatal"}

type logLine struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	Service   string `json:"service"`
}

func generated(t *testing.T) sampleanalysis.Dataset {
	t.Helper()

	dataset, err := sampleanalysis.Generate()
	if err != nil {
		t.Fatalf("generate the sample: %v", err)
	}

	return dataset
}

func parsedSources(t *testing.T, dataset sampleanalysis.Dataset) []seriesDomain.Series {
	t.Helper()

	parsed := make([]seriesDomain.Series, 0, len(dataset.Sources))

	for _, source := range dataset.Sources {
		series, err := rrdUsecase.ParseDump(source.Content, source.Name)
		if err != nil {
			t.Fatalf("parse %s: %v", source.Name, err)
		}

		if len(series) != 1 {
			t.Fatalf("want one series in %s, got %d", source.Name, len(series))
		}

		parsed = append(parsed, series[0])
	}

	return parsed
}

func TestGenerateIsTheSameOnEveryCall(t *testing.T) {
	first := generated(t)
	second := generated(t)

	if !reflect.DeepEqual(first, second) {
		t.Fatal("want two generations of the sample to be identical")
	}
}

func TestGenerateWritesSourcesTheDumpParserReadsOneSeriesEach(t *testing.T) {
	series := parsedSources(t, generated(t))

	if len(series) != sampleSourceCount {
		t.Fatalf("want %d sources, got %d", sampleSourceCount, len(series))
	}

	for _, read := range series {
		if len(read.Archives) != 1 || len(read.Archives[0].Samples) == 0 {
			t.Fatalf("want %s to hold one archive of samples, got %+v", read.File, read.Archives)
		}
	}
}

func TestGenerateWritesALogOfJSONLinesInOrderWithinTheRecording(t *testing.T) {
	dataset := generated(t)
	recorded := parsedSources(t, dataset)[0]
	archive := recorded.Archives[0]
	firstInstant := time.UnixMilli(archive.StartMilliseconds)
	lastInstant := time.UnixMilli(archive.StartMilliseconds + int64(len(archive.Samples))*archive.StepMilliseconds)

	scanner := bufio.NewScanner(bytes.NewReader(dataset.Log.Content))
	previous := firstInstant
	lineCount := 0

	for scanner.Scan() {
		var line logLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			t.Fatalf("line %d is not JSON: %v", lineCount+1, err)
		}

		at, err := time.Parse(time.RFC3339Nano, line.Timestamp)
		if err != nil {
			t.Fatalf("line %d has no timestamp: %v", lineCount+1, err)
		}

		if at.Before(previous) || at.After(lastInstant) || !slices.Contains(logLevels, line.Level) || line.Message == "" || line.Service == "" {
			t.Fatalf("line %d is out of order, outside the recording or missing a field: %+v", lineCount+1, line)
		}

		previous = at
		lineCount++
	}

	if lineCount == 0 {
		t.Fatal("want a log with entries, got none")
	}
}

func TestGenerateOpensOnChartsOfItsOwnSeries(t *testing.T) {
	dataset := generated(t)
	series := parsedSources(t, dataset)

	labels := make([]string, 0, len(series))
	for _, read := range series {
		labels = append(labels, read.Label)
	}

	for _, chart := range dataset.Canvas {
		if !slices.Contains(labels, chart.Label) {
			t.Fatalf("chart %q draws a series the sample does not hold", chart.Label)
		}

		for _, merged := range chart.Merged {
			if !slices.Contains(labels, merged.Label) {
				t.Fatalf("chart %q merges a series the sample does not hold: %q", chart.Label, merged.Label)
			}
		}
	}
}
