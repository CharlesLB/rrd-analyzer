package usecase

import (
	"slices"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// validateCanvas refuses a canvas the frontend could not have laid out: a chart drawing too many
// series, a merged series read against an axis its chart cannot have, or a
// reference line at a statistic no window holds. A chart of n series has at most n axes, numbered
// from zero.
func validateCanvas(canvas []analysisDomain.CanvasChart) error {
	for _, chart := range canvas {
		if len(chart.Merged)+1 > analysisDomain.MaximumChartSeries {
			return analysisDomain.ErrChartFull
		}

		for _, merged := range chart.Merged {
			if merged.Axis < 0 || merged.Axis > len(chart.Merged) {
				return analysisDomain.ErrAxisUnknown
			}
		}

		for _, statistic := range chart.ReferenceLines {
			if !slices.Contains(analysisDomain.ReferenceLineStatistics, statistic) {
				return analysisDomain.ErrStatisticUnknown
			}
		}
	}

	return nil
}

// cloneCanvas copies the canvas down to each chart's merged series and reference lines, so the store
// keeps nothing the caller can still change.
func cloneCanvas(canvas []analysisDomain.CanvasChart) []analysisDomain.CanvasChart {
	cloned := make([]analysisDomain.CanvasChart, 0, len(canvas))
	for _, chart := range canvas {
		chart.Merged = slices.Clone(chart.Merged)
		chart.ReferenceLines = slices.Clone(chart.ReferenceLines)
		cloned = append(cloned, chart)
	}

	return cloned
}

// canvasOf finds each series of each chart of the stored canvas among the series the sources hold
// now, the way a seriesLocator does.
//
// A series the sources no longer hold, or whose label now names more than one series and so cannot
// be told apart, is left off its chart, and a chart left with no series is left off the canvas: a
// file replaced by one with fewer data sources must open on the charts it can still draw rather than
// fail. A series already drawn earlier on the canvas is not drawn twice.
func canvasOf(canvas []analysisDomain.CanvasChart, series []seriesDomain.Series) []seriesDomain.PlottedChart {
	locator := newSeriesLocator(series)

	charts := make([]seriesDomain.PlottedChart, 0, len(canvas))
	for _, chart := range canvas {
		plotted := plottedSeriesOf(chart, locator)
		if len(plotted) == 0 {
			continue
		}

		charts = append(charts, seriesDomain.PlottedChart{Series: plotted, ReferenceLines: chart.ReferenceLines})
	}

	return charts
}

// plottedSeriesOf resolves one chart's series, its first series on axis 0 and each merged one on the
// axis it was saved with. Every series it places is claimed, so a later chart cannot draw it again.
func plottedSeriesOf(chart analysisDomain.CanvasChart, locator *seriesLocator) []seriesDomain.PlottedSeries {
	wanted := append([]analysisDomain.MergedSeries{{SeriesID: chart.SeriesID, Label: chart.Label}}, chart.Merged...)

	plotted := make([]seriesDomain.PlottedSeries, 0, len(wanted))
	for _, entry := range wanted {
		found, isFound := locator.claim(entry.SeriesID, entry.Label)
		if !isFound {
			continue
		}

		plotted = append(plotted, seriesDomain.PlottedSeries{SeriesID: found.ID, Axis: entry.Axis})
	}

	return plotted
}
