package domain_test

import (
	"math"
	"testing"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const step = 300000

func seriesOf(values ...seriesDomain.Sample) seriesDomain.Series {
	return seriesDomain.Series{
		StartMilliseconds: 0,
		StepMilliseconds:  step,
		Archives: []seriesDomain.Archive{
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: step, StartMilliseconds: 0, Samples: values},
		},
	}
}

func known(values ...float64) []seriesDomain.Sample {
	out := make([]seriesDomain.Sample, 0, len(values))
	for _, value := range values {
		out = append(out, seriesDomain.Known(value))
	}

	return out
}

func TestAggregateAveragesEveryReadingStampedInsideAColumn(t *testing.T) {
	series := seriesOf(known(10, 20, 30, 40)...)

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  0,
		UntilMilliseconds: 4 * step,
		Columns:           2,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertSamples(t, got, []float64{15, 35})
}

func TestAggregateLeavesOutTheReadingStampedAtTheWindowEnd(t *testing.T) {
	series := seriesOf(known(10, 20, 30)...)

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  0,
		UntilMilliseconds: 2 * step,
		Columns:           1,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertSamples(t, got, []float64{15})
}

func TestAggregateGivesAColumnNarrowerThanTheStepTheReadingUnderIt(t *testing.T) {
	series := seriesOf(known(10, 20)...)

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  step,
		UntilMilliseconds: step + step/4,
		Columns:           2,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertSamples(t, got, []float64{20, 20})
}

func TestAggregateAppliesTheRequestedConsolidation(t *testing.T) {
	series := seriesOf(known(10, 20, 30, 40)...)

	for _, testCase := range []struct {
		function seriesDomain.ConsolidationFunction
		want     []float64
	}{
		{seriesDomain.ConsolidationMaximum, []float64{20, 40}},
		{seriesDomain.ConsolidationMinimum, []float64{10, 30}},
		{seriesDomain.ConsolidationLast, []float64{20, 40}},
	} {
		got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
			FromMilliseconds:  0,
			UntilMilliseconds: 4 * step,
			Columns:           2,
			Function:          testCase.function,
		})

		assertSamples(t, got, testCase.want)
	}
}

func TestAggregateKeepsAColumnWithNoReadingAsAGap(t *testing.T) {
	series := seriesOf(seriesDomain.Known(10), seriesDomain.Unknown(), seriesDomain.Unknown(), seriesDomain.Known(40))

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  0,
		UntilMilliseconds: 4 * step,
		Columns:           4,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if !got[0].Present || got[1].Present || got[2].Present || !got[3].Present {
		t.Fatalf("want present,gap,gap,present, got %+v", got)
	}
}

func TestAggregateReadsGapsOutsideTheStoredRange(t *testing.T) {
	series := seriesOf(known(1, 2)...)

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  10 * step,
		UntilMilliseconds: 12 * step,
		Columns:           2,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if got[0].Present || got[1].Present {
		t.Fatalf("want gaps beyond the stored range, got %+v", got)
	}
}

func TestSummariseReportsTheStatisticsPanelNumbers(t *testing.T) {
	summary, hasData := seriesDomain.Summarise(known(4, 1, 9, 2))
	if !hasData {
		t.Fatal("want data")
	}

	for name, pair := range map[string][2]float64{
		"minimum":      {summary.Minimum, 1},
		"maximum":      {summary.Maximum, 9},
		"average":      {summary.Average, 4},
		"percentile95": {summary.Percentile95, 9},
		"last":         {summary.Last, 2},
	} {
		if math.Abs(pair[0]-pair[1]) > 1e-9 {
			t.Errorf("%s = %v, want %v", name, pair[0], pair[1])
		}
	}
}

func TestSummariseCountsGapsAndReportsNoDataWhenEverythingIsMissing(t *testing.T) {
	withGap := []seriesDomain.Sample{seriesDomain.Known(5), seriesDomain.Unknown(), seriesDomain.Known(7)}

	summary, hasData := seriesDomain.Summarise(withGap)
	if !hasData || summary.GapCount != 1 || summary.Last != 7 {
		t.Errorf("want 1 gap and a last reading of 7, got %+v (hasData=%v)", summary, hasData)
	}

	if _, hasData := seriesDomain.Summarise([]seriesDomain.Sample{seriesDomain.Unknown()}); hasData {
		t.Error("a window of only gaps must report no data")
	}
}

func TestArchivesForFallsBackToTheAverageWhenTheFunctionIsNotArchived(t *testing.T) {
	series := seriesOf(known(1, 2)...)

	got := series.ArchivesFor(seriesDomain.ConsolidationMaximum)
	if len(got) != 1 || len(got[0].Samples) != 2 {
		t.Errorf("want the average archive as a fallback, got %+v", got)
	}
}

func TestArchivesForOrdersTheArchivesFinestFirst(t *testing.T) {
	series := seriesDomain.Series{Archives: []seriesDomain.Archive{
		{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 4 * step},
		{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: step},
		{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 2 * step},
	}}

	got := series.ArchivesFor(seriesDomain.ConsolidationAverage)

	if got[0].StepMilliseconds != step || got[1].StepMilliseconds != 2*step || got[2].StepMilliseconds != 4*step {
		t.Errorf("want the finest archive first, got %+v", got)
	}
}

// The coarse archive reaches back further than the fine one, so a window that starts before the
// fine archive begins has to read the history behind it and then hand over, without a seam.
func TestAggregateReadsTheCoarseHistoryBehindTheFineArchive(t *testing.T) {
	series := seriesDomain.Series{
		StartMilliseconds: 0,
		StepMilliseconds:  step,
		Archives: []seriesDomain.Archive{
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 2 * step, StartMilliseconds: 0, Samples: known(1, 2, 3)},
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: step, StartMilliseconds: 4 * step, Samples: known(10, 20, 30)},
		},
	}

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  0,
		UntilMilliseconds: 6 * step,
		Columns:           6,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertSamples(t, got, []float64{1, 1, 2, 2, 10, 20})
}

func TestAggregateKeepsAHoleOfTheFineArchiveEvenWhereTheCoarseArchiveHasAReading(t *testing.T) {
	series := seriesDomain.Series{
		StartMilliseconds: 0,
		StepMilliseconds:  step,
		Archives: []seriesDomain.Archive{
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 2 * step, StartMilliseconds: 0, Samples: known(1, 7, 8)},
			{
				Function: seriesDomain.ConsolidationAverage, StepMilliseconds: step, StartMilliseconds: 2 * step,
				Samples: []seriesDomain.Sample{seriesDomain.Unknown(), seriesDomain.Known(9), seriesDomain.Known(10)},
			},
		},
	}

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  2 * step,
		UntilMilliseconds: 5 * step,
		Columns:           3,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if got[0].Present {
		t.Fatalf("[0] = %+v, want the fine archive's hole", got[0])
	}

	assertSamples(t, got[1:], []float64{9, 10})
}

func assertSamples(t *testing.T, got []seriesDomain.Sample, want []float64) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("length = %d, want %d", len(got), len(want))
	}

	for index, expected := range want {
		if !got[index].Present || math.Abs(got[index].Value-expected) > 1e-9 {
			t.Errorf("[%d] = %+v, want %v", index, got[index], expected)
		}
	}
}

func TestAggregateReadsOnlyTheStoredRowsOfAColumnThatStraddlesTheStartOfTheArchive(t *testing.T) {
	series := seriesOf(known(10, 20, 30)...)

	got := seriesDomain.Aggregate(series, seriesDomain.AggregationRequest{
		FromMilliseconds:  -2 * step,
		UntilMilliseconds: 2 * step,
		Columns:           1,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertSamples(t, got, []float64{15})
}

func BenchmarkAggregate_AYearOverAMinuteArchiveOfADayAndADailyArchiveOfAYear(b *testing.B) {
	const (
		minute    = 60_000
		day       = 1_440 * minute
		year      = 365 * day
		yearStart = 0
		dayStart  = year - day
	)

	minuteRows := make([]seriesDomain.Sample, day/minute)
	for index := range minuteRows {
		minuteRows[index] = seriesDomain.Known(float64(index))
	}

	dailyRows := make([]seriesDomain.Sample, year/day)
	for index := range dailyRows {
		dailyRows[index] = seriesDomain.Known(float64(index))
	}

	series := seriesDomain.Series{
		StepMilliseconds: minute,
		Archives: []seriesDomain.Archive{
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: minute, StartMilliseconds: dayStart, Samples: minuteRows},
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: day, StartMilliseconds: yearStart, Samples: dailyRows},
		},
	}
	request := seriesDomain.AggregationRequest{FromMilliseconds: yearStart, UntilMilliseconds: year, Columns: 260, Function: seriesDomain.ConsolidationAverage}

	for b.Loop() {
		seriesDomain.Aggregate(series, request)
	}
}
