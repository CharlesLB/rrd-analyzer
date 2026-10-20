package usecase

import (
	"fmt"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const seriesIDPrefix = "s"

// SeriesIDAt is the identifier a series is named by in its analysis: its position among every series
// the analysis' sources hold, in the order the sources are listed. A canvas written ahead of opening
// the analysis, as the browser edition's sample is, refers to its series by these.
func SeriesIDAt(position int) string {
	return fmt.Sprintf("%s%d", seriesIDPrefix, position)
}

// assemble names and colours every loaded series by its position among the analysis' sources, s0,
// s1 and on. A stored canvas refers to series by those names, which is why a seriesLocator checks a
// stored label before trusting the position it names.
func assemble(analysis analysisDomain.Analysis, loaded []seriesDomain.Series) seriesDomain.Bundle {
	bundle := seriesDomain.Bundle{
		AnalysisID:   analysis.ID,
		AnalysisName: analysis.Name,
		Series:       make([]seriesDomain.Series, 0, len(loaded)),
	}

	for index, series := range loaded {
		series.ID = SeriesIDAt(index)
		series.Color = seriesDomain.ColorAt(index)
		bundle.Series = append(bundle.Series, series)
	}

	bundle.FromMilliseconds, bundle.UntilMilliseconds = spanOf(bundle.Series)

	return bundle
}

// spanOf is the stretch the charts show and the insights engine reads: from the oldest reading any
// series holds to the end of the newest archive. rrdtool allocates a year-long archive whole when it
// creates a file, so starting at the oldest archive would open on months of nothing before the first
// reading, which a chart draws as a blank and the engine reads as an outage. Only when no series
// holds a single reading does the archives' start stand.
func spanOf(series []seriesDomain.Series) (int64, int64) {
	if len(series) == 0 {
		return 0, 0
	}

	from, until := series[0].StartMilliseconds, series[0].UntilMilliseconds()
	earliestReading, hasReading := int64(0), false

	for _, one := range series {
		from = min(from, one.StartMilliseconds)
		until = max(until, one.UntilMilliseconds())

		if reading, found := one.EarliestReadingMilliseconds(); found && (!hasReading || reading < earliestReading) {
			earliestReading, hasReading = reading, true
		}
	}

	if hasReading {
		return earliestReading, until
	}

	return from, until
}
