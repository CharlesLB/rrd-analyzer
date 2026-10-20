package domain

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"

const (
	ErrAnalysisNotFound failure.Error = "analysis: no analysis with that identifier"
	ErrNoSources        failure.Error = "analysis: an analysis needs at least one source"
	ErrNameEmpty        failure.Error = "analysis: an analysis needs a name that is not blank"
	ErrSeriesNotFound   failure.Error = "analysis: no series with that identifier in this analysis"
	ErrSourceUnlocated  failure.Error = "analysis: this source has no file path, so there is nothing on disk to read"
	ErrChartFull        failure.Error = "analysis: a chart draws at most five series"
	ErrAxisUnknown      failure.Error = "analysis: a merged series names a value axis its chart cannot have"
	ErrStatisticUnknown failure.Error = "analysis: a reference line names a statistic a window does not hold"
	ErrColorInvalid     failure.Error = "analysis: a series color is written #rrggbb"
)
