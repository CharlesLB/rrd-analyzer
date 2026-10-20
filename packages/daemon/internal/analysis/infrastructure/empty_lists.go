package infrastructure

import analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"

// The library hands every list an analysis carries out as a list, never as nothing, whichever store
// keeps it: the frontend reads an absent canvas, library order, color list or set of merged series
// as an empty one only because none ever arrives absent.

func referencesOrEmpty(references []analysisDomain.ChartReference) []analysisDomain.ChartReference {
	if references == nil {
		return []analysisDomain.ChartReference{}
	}

	return references
}

func colorsOrEmpty(colors []analysisDomain.SeriesColor) []analysisDomain.SeriesColor {
	if colors == nil {
		return []analysisDomain.SeriesColor{}
	}

	return colors
}

// chartsOrEmpty is the canvas with every absent list made an empty one: a canvas saved before charts
// could be merged holds no merged series at all, and reads as charts that have none.
func chartsOrEmpty(canvas []analysisDomain.CanvasChart) []analysisDomain.CanvasChart {
	charts := make([]analysisDomain.CanvasChart, 0, len(canvas))
	for _, chart := range canvas {
		if chart.Merged == nil {
			chart.Merged = []analysisDomain.MergedSeries{}
		}

		charts = append(charts, chart)
	}

	return charts
}
