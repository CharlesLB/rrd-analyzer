// Package domain holds what an analysis is and the ports the analysis use cases consume.
package domain

import "time"

// ReferenceLineStatistics names every statistic of a window a chart can draw a horizontal line at.
// A canvas naming anything else was not laid out by the frontend, so it is refused rather than
// stored and silently ignored when it is read back.
var ReferenceLineStatistics = []string{"minimum", "average", "maximum", "percentile95", "current"}

// MaximumChartSeries is how many series one chart draws once others are merged into it. Past five
// the lines tangle and the value axes crowd the plot they label.
const MaximumChartSeries = 5

// UnitRule gives every series whose name matches Pattern, a glob such as "elasticsearch_*_rate", the
// unit a person said it is measured in, over whatever unit its name suggested.
type UnitRule struct {
	Pattern string
	Unit    string
}

type SourceFile struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// Identity is what makes two sources the same file: the path, or the name when there is none, which
// is how a browser hands a file over.
func (file SourceFile) Identity() string {
	if file.Path != "" {
		return file.Path
	}

	return file.Name
}

// SourcesNotListed keeps the requested files that are neither listed already nor repeated earlier in
// the request, in the order they were asked for. It is declared here because two layers have to
// agree on it: the use case, which reads only the new files, and the store, which decides again
// inside its transaction so that two requests racing each other cannot both add the same file.
func SourcesNotListed(listed []SourceFile, requested []SourceFile) []SourceFile {
	known := make(map[string]bool, len(listed)+len(requested))
	for _, file := range listed {
		known[file.Identity()] = true
	}

	added := make([]SourceFile, 0, len(requested))
	for _, file := range requested {
		if known[file.Identity()] {
			continue
		}

		known[file.Identity()] = true
		added = append(added, file)
	}

	return added
}

// ChartReference names one series the way a stored analysis does. The label travels with the
// identifier so the library can describe a canvas without reading the files the series came from.
type ChartReference struct {
	SeriesID string `json:"seriesId"`
	Label    string `json:"label"`
}

// SeriesColor is the color a person gave one series, written #rrggbb in lowercase. The series is
// named the way a canvas chart names it, so the color is found again once the sources move it.
type SeriesColor struct {
	SeriesID string `json:"seriesId"`
	Label    string `json:"label"`
	Color    string `json:"color"`
}

// CanvasChart is one chart on an analysis' canvas: the series it was opened on, and the series
// merged into it since. The first series keeps the two fields a canvas chart always had, so a canvas
// saved with merged charts still opens in an earlier build, on the first series of each chart.
type CanvasChart struct {
	SeriesID string         `json:"seriesId"`
	Label    string         `json:"label"`
	Merged   []MergedSeries `json:"merged"`

	// ReferenceLines names the statistics of the window the chart draws a horizontal line at. An
	// empty list, the shape every canvas saved before had, draws none.
	ReferenceLines []string `json:"referenceLines,omitempty"`
}

// MergedSeries is a series drawn over a chart it was dragged onto. Axis numbers the value axis it is
// read against, counted with the chart's first series on axis 0: series share an axis only when
// they share a unit, so a value is never rescaled to fit a line it was not measured in.
type MergedSeries struct {
	SeriesID string `json:"seriesId"`
	Label    string `json:"label"`
	Axis     int    `json:"axis"`
}

type Analysis struct {
	ID     string        `json:"id"`
	Name   string        `json:"name"`
	Files  []SourceFile  `json:"files"`
	Canvas []CanvasChart `json:"canvas"`

	// LibraryOrder is the order a person arranged the chart library in, each series named the way a
	// canvas chart is. Empty is the order the sources hold the series in.
	LibraryOrder []ChartReference `json:"libraryOrder"`

	// SeriesColors is the colors a person gave series in place of the one each takes from its
	// position. Empty leaves every series its default color.
	SeriesColors []SeriesColor `json:"seriesColors"`

	CreatedAt    time.Time `json:"createdAt"`
	LastAccessed time.Time `json:"lastAccessed"`
}
