package domain_test

import (
	"reflect"
	"testing"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// edgeSeries keeps ten seconds of one-second rows behind twenty seconds of five-second ones. The
// fine archive was allocated whole and written only from its sixth row on, as rrdtool leaves a file
// younger than its archive.
func edgeSeries() seriesDomain.Series {
	fine := make([]seriesDomain.Sample, 10)
	for row := 5; row < len(fine); row++ {
		fine[row] = seriesDomain.Known(5)
	}

	return seriesDomain.Series{Archives: []seriesDomain.Archive{
		{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 1000, StartMilliseconds: 10_000, Samples: fine, CoversIntervals: true},
		{
			Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 5000, StartMilliseconds: 0, CoversIntervals: true,
			Samples: []seriesDomain.Sample{seriesDomain.Known(1), seriesDomain.Known(2), seriesDomain.Known(3), seriesDomain.Known(4)},
		},
	}}
}

// The middle column lies across the first row of the fine archive and finds nothing fine in it. The
// chart reads the coarse rows there; the range read the insights engine takes used to report a gap,
// so a finding could call an outage where the chart under it drew a line.
func TestTheChartAndTheRangeReadChooseTheSameArchiveForEveryColumn(t *testing.T) {
	series := edgeSeries()
	want := []seriesDomain.Sample{seriesDomain.Known(1.5), seriesDomain.Known(2.5), seriesDomain.Known(5)}

	drawn := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds: 0, UntilMilliseconds: 21_000, Columns: 3, Function: seriesDomain.ConsolidationAverage,
	})

	read := seriesDomain.ReadRange(series, seriesDomain.RangeRequest{
		FromMilliseconds: 0, UntilMilliseconds: 19_999, MaximumSamples: 3, Function: seriesDomain.ConsolidationAverage,
	})

	if read.StepMilliseconds != 7000 {
		t.Fatalf("range read step = %d, want the 7000 the chart columns are wide", read.StepMilliseconds)
	}

	if !reflect.DeepEqual(drawn, want) {
		t.Errorf("chart columns = %+v, want %+v", drawn, want)
	}

	if !reflect.DeepEqual(read.Samples, want) {
		t.Errorf("range read = %+v, want %+v, the columns the chart draws", read.Samples, want)
	}
}

func TestAHoleInsideTheFineArchiveStaysAHoleForTheChartAndTheRangeReadAlike(t *testing.T) {
	series := edgeSeries()

	drawn := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds: 11_000, UntilMilliseconds: 13_000, Columns: 2, Function: seriesDomain.ConsolidationAverage,
	})

	read := seriesDomain.ReadRange(series, seriesDomain.RangeRequest{
		FromMilliseconds: 11_000, UntilMilliseconds: 12_999, Function: seriesDomain.ConsolidationAverage,
	})

	want := []seriesDomain.Sample{seriesDomain.Unknown(), seriesDomain.Unknown()}
	if !reflect.DeepEqual(drawn, want) || !reflect.DeepEqual(read.Samples, want) {
		t.Errorf("chart = %+v and range read = %+v, want both to keep the two unwritten rows as holes", drawn, read.Samples)
	}
}
