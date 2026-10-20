package usecase

import (
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// libraryOrderOf lists the series in the order a person arranged the chart library in. Each stored
// entry is found among the series the sources hold now the way a canvas chart is, and the series the
// stored order does not name, such as a data source a file has gained since, follow in the order the
// sources hold them. The result is a new slice, since the bundle's own is shared by every reader of
// the cache.
func libraryOrderOf(order []analysisDomain.ChartReference, series []seriesDomain.Series) []seriesDomain.Series {
	if len(order) == 0 {
		return series
	}

	locator := newSeriesLocator(series)
	ordered := make([]seriesDomain.Series, 0, len(series))

	for _, entry := range order {
		if found, isFound := locator.claim(entry.SeriesID, entry.Label); isFound {
			ordered = append(ordered, found)
		}
	}

	for _, one := range series {
		if !locator.isClaimed(one.ID) {
			ordered = append(ordered, one)
		}
	}

	return ordered
}
