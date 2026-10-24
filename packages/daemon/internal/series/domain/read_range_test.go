package domain_test

import (
	"math"
	"testing"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const rangeStep = 300_000

func rangeSeries() seriesDomain.Series {
	return seriesDomain.Series{
		ID: "s0",
		Archives: []seriesDomain.Archive{{
			Function:         seriesDomain.ConsolidationAverage,
			StepMilliseconds: rangeStep,
			Samples: []seriesDomain.Sample{
				seriesDomain.Known(1), seriesDomain.Known(2), seriesDomain.Unknown(),
				seriesDomain.Known(4), seriesDomain.Known(5), seriesDomain.Known(6),
			},
		}},
	}
}

func TestReadRange_WithinBudget_ReturnsTheRowsStampedInsideTheRange(t *testing.T) {
	read := seriesDomain.ReadRange(rangeSeries(), seriesDomain.RangeRequest{
		FromMilliseconds:  1,
		UntilMilliseconds: 4 * rangeStep,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if read.StartMilliseconds != rangeStep || read.StepMilliseconds != rangeStep || len(read.Samples) != 4 {
		t.Fatalf("read = start %d, step %d, %d samples; want start %d, step %d, 4 samples",
			read.StartMilliseconds, read.StepMilliseconds, len(read.Samples), rangeStep, rangeStep)
	}

	if read.Samples[1].Present || read.Samples[3].Value != 5 {
		t.Fatalf("samples = %+v, want a hole second and 5 last", read.Samples)
	}
}

func TestReadRange_OverBudget_ConsolidatesWholeRowsIntoBuckets(t *testing.T) {
	read := seriesDomain.ReadRange(rangeSeries(), seriesDomain.RangeRequest{
		UntilMilliseconds: 5 * rangeStep,
		MaximumSamples:    2,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if read.StepMilliseconds != 3*rangeStep || read.ArchiveStepMilliseconds != rangeStep {
		t.Fatalf("steps = %d over %d, want %d over %d", read.StepMilliseconds, read.ArchiveStepMilliseconds, 3*rangeStep, rangeStep)
	}

	assertReadings(t, read.Samples, []float64{1.5, 5})
}

func intervalSeries() seriesDomain.Series {
	return seriesDomain.Series{
		ID: "s2",
		Archives: []seriesDomain.Archive{{
			Function:         seriesDomain.ConsolidationAverage,
			StepMilliseconds: rangeStep,
			CoversIntervals:  true,
			Samples:          known(1, 2, 3, 4, 5, 6),
		}},
	}
}

func TestReadRange_OverBudgetInsideTheArchive_BucketsStartAtTheFirstRowOfTheRange(t *testing.T) {
	read := seriesDomain.ReadRange(intervalSeries(), seriesDomain.RangeRequest{
		FromMilliseconds:  2 * rangeStep,
		UntilMilliseconds: 5 * rangeStep,
		MaximumSamples:    2,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertReadings(t, read.Samples, []float64{3.5, 5.5})
}

func TestReadRange_WholeSpanOfAnIntervalArchive_EndsAtItsLastRow(t *testing.T) {
	series := intervalSeries()

	read := seriesDomain.ReadRange(series, seriesDomain.RangeRequest{
		UntilMilliseconds: series.UntilMilliseconds(),
		Function:          seriesDomain.ConsolidationAverage,
	})
	bucketed := seriesDomain.ReadRange(series, seriesDomain.RangeRequest{
		UntilMilliseconds: series.UntilMilliseconds(),
		MaximumSamples:    2,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertReadings(t, read.Samples, []float64{1, 2, 3, 4, 5, 6})
	assertReadings(t, bucketed.Samples, []float64{2, 5})
}

func TestReadRange_MissingConsolidation_ReportsTheAverageItReadInstead(t *testing.T) {
	read := seriesDomain.ReadRange(rangeSeries(), seriesDomain.RangeRequest{
		UntilMilliseconds: rangeStep,
		Function:          seriesDomain.ConsolidationMaximum,
	})

	if read.Function != seriesDomain.ConsolidationAverage || len(read.Samples) != 2 {
		t.Fatalf("read = %s with %d samples, want AVERAGE with 2", read.Function, len(read.Samples))
	}
}

func TestRangeRead_ValuesWithHoles_KeepsReadingsAndTurnsMissingSamplesIntoNaN(t *testing.T) {
	read := seriesDomain.ReadRange(rangeSeries(), seriesDomain.RangeRequest{
		UntilMilliseconds: 3 * rangeStep,
		Function:          seriesDomain.ConsolidationAverage,
	})

	values := read.ValuesWithHoles()

	if len(values) != 4 || values[0] != 1 || values[1] != 2 || !math.IsNaN(values[2]) || values[3] != 4 {
		t.Fatalf("values = %v, want [1 2 NaN 4]", values)
	}
}

func TestRangeRead_ValuesWithHoles_NoSamples_IsEmptyButNotNil(t *testing.T) {
	values := seriesDomain.RangeRead{}.ValuesWithHoles()

	if values == nil || len(values) != 0 {
		t.Fatalf("values = %#v, want an empty non-nil slice", values)
	}
}

// layeredSeries keeps a year-like coarse archive behind a day-like fine one: the fine archive
// starts where the coarse one's third row stands and has a hole where the coarse archive still
// holds a reading.
func layeredSeries() seriesDomain.Series {
	return seriesDomain.Series{
		ID: "s1",
		Archives: []seriesDomain.Archive{
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 4 * rangeStep, Samples: known(1, 2, 3, 4)},
			{
				Function: seriesDomain.ConsolidationAverage, StepMilliseconds: rangeStep, StartMilliseconds: 8 * rangeStep,
				Samples: []seriesDomain.Sample{seriesDomain.Known(10), seriesDomain.Known(11), seriesDomain.Unknown(), seriesDomain.Known(13)},
			},
			{Function: seriesDomain.ConsolidationMaximum, StepMilliseconds: rangeStep, StartMilliseconds: 8 * rangeStep, Samples: known(20, 21, 22, 23)},
		},
	}
}

func assertReadings(t *testing.T, got []seriesDomain.Sample, want []float64) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("samples = %+v, want %v", got, want)
	}

	for index, expected := range want {
		if math.IsNaN(expected) != !got[index].Present || (got[index].Present && math.Abs(got[index].Value-expected) > 1e-9) {
			t.Errorf("sample %d = %+v, want %v", index, got[index], expected)
		}
	}
}

func TestReadRange_RangeOlderThanTheFineArchive_ReadsTheCoarseHistoryAtTheFineStep(t *testing.T) {
	read := seriesDomain.ReadRange(layeredSeries(), seriesDomain.RangeRequest{
		UntilMilliseconds: 11 * rangeStep,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if read.StartMilliseconds != 0 || read.StepMilliseconds != rangeStep || read.ArchiveStepMilliseconds != 4*rangeStep {
		t.Fatalf("read = start %d, step %d over %d; want start 0, step %d over %d",
			read.StartMilliseconds, read.StepMilliseconds, read.ArchiveStepMilliseconds, rangeStep, 4*rangeStep)
	}

	assertReadings(t, read.Samples, []float64{1, 1, 1, 1, 2, 2, 2, 2, 10, 11, math.NaN(), 13})
}

func TestReadRange_OverBudgetAcrossArchives_BucketsEachColumnFromTheArchiveCoveringIt(t *testing.T) {
	read := seriesDomain.ReadRange(layeredSeries(), seriesDomain.RangeRequest{
		UntilMilliseconds: 11 * rangeStep,
		MaximumSamples:    3,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if read.StepMilliseconds != 4*rangeStep || read.ArchiveStepMilliseconds != 4*rangeStep {
		t.Fatalf("steps = %d over %d, want %d over %d", read.StepMilliseconds, read.ArchiveStepMilliseconds, 4*rangeStep, 4*rangeStep)
	}

	assertReadings(t, read.Samples, []float64{1, 2, 34.0 / 3})
}

func TestReadRange_ConsolidationKeptForLessTimeThanTheAverage_ReadsTheAverageOnlyWhenTheRangeReachesPastIt(t *testing.T) {
	tests := []struct {
		name         string
		giveFrom     int64
		wantFunction seriesDomain.ConsolidationFunction
		wantFirst    float64
	}{
		{name: "range older than the maximum archive", giveFrom: 0, wantFunction: seriesDomain.ConsolidationAverage, wantFirst: 1},
		{name: "range inside the maximum archive", giveFrom: 8 * rangeStep, wantFunction: seriesDomain.ConsolidationMaximum, wantFirst: 20},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			read := seriesDomain.ReadRange(layeredSeries(), seriesDomain.RangeRequest{
				FromMilliseconds:  tt.giveFrom,
				UntilMilliseconds: 11 * rangeStep,
				Function:          seriesDomain.ConsolidationMaximum,
			})

			if read.Function != tt.wantFunction || len(read.Samples) == 0 || read.Samples[0].Value != tt.wantFirst {
				t.Fatalf("read = %s starting %+v, want %s starting %v", read.Function, read.Samples, tt.wantFunction, tt.wantFirst)
			}
		})
	}
}

func TestEarliestReadingMilliseconds_ArchivesAllocatedBeforeTheirFirstRow_IsTheOldestRowWritten(t *testing.T) {
	series := seriesDomain.Series{Archives: []seriesDomain.Archive{
		{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 4 * rangeStep, Samples: []seriesDomain.Sample{seriesDomain.Unknown(), seriesDomain.Unknown(), seriesDomain.Known(3)}},
		{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: rangeStep, StartMilliseconds: 6 * rangeStep, Samples: []seriesDomain.Sample{seriesDomain.Unknown(), seriesDomain.Known(11)}},
	}}

	earliest, found := series.EarliestReadingMilliseconds()
	if !found || earliest != 7*rangeStep {
		t.Fatalf("earliest = %d (found %v), want %d", earliest, found, 7*rangeStep)
	}

	if _, found := (seriesDomain.Series{Archives: []seriesDomain.Archive{{Samples: []seriesDomain.Sample{seriesDomain.Unknown()}}}}).EarliestReadingMilliseconds(); found {
		t.Fatal("a series that never stored a reading has no earliest reading")
	}
}

func TestReadRange_RangeOutsideTheArchive_ReturnsNoSamples(t *testing.T) {
	read := seriesDomain.ReadRange(rangeSeries(), seriesDomain.RangeRequest{
		FromMilliseconds:  10 * rangeStep,
		UntilMilliseconds: 12 * rangeStep,
		Function:          seriesDomain.ConsolidationAverage,
	})

	if len(read.Samples) != 0 {
		t.Fatalf("samples = %+v, want none", read.Samples)
	}
}

func TestReadRange_OverBudgetNotDividingIntoWholeBuckets_LastBucketStopsAtTheRange(t *testing.T) {
	read := seriesDomain.ReadRange(rangeSeries(), seriesDomain.RangeRequest{
		UntilMilliseconds: 4 * rangeStep,
		MaximumSamples:    2,
		Function:          seriesDomain.ConsolidationAverage,
	})

	assertReadings(t, read.Samples, []float64{1.5, 4.5})
}

func TestReadRange_SeriesWithoutRows_ReturnsNoSamplesUnderTheRequestedConsolidation(t *testing.T) {
	series := seriesDomain.Series{ID: "s4", Archives: []seriesDomain.Archive{{Function: seriesDomain.ConsolidationMaximum, StepMilliseconds: rangeStep}}}

	read := seriesDomain.ReadRange(series, seriesDomain.RangeRequest{
		UntilMilliseconds: 4 * rangeStep,
		Function:          seriesDomain.ConsolidationMaximum,
	})

	if len(read.Samples) != 0 || read.Function != seriesDomain.ConsolidationMaximum {
		t.Fatalf("read = %+v, want no samples under %q", read, seriesDomain.ConsolidationMaximum)
	}
}

func TestReadRange_AverageArchiveHoldingNoRows_ReadsTheRequestedConsolidation(t *testing.T) {
	series := seriesDomain.Series{
		ID: "s5",
		Archives: []seriesDomain.Archive{
			{Function: seriesDomain.ConsolidationAverage, StepMilliseconds: rangeStep},
			{Function: seriesDomain.ConsolidationMaximum, StepMilliseconds: rangeStep, Samples: known(20, 21, 22)},
		},
	}

	read := seriesDomain.ReadRange(series, seriesDomain.RangeRequest{
		UntilMilliseconds: 2 * rangeStep,
		Function:          seriesDomain.ConsolidationMaximum,
	})

	if read.Function != seriesDomain.ConsolidationMaximum {
		t.Fatalf("function = %q, want %q", read.Function, seriesDomain.ConsolidationMaximum)
	}

	assertReadings(t, read.Samples, []float64{20, 21, 22})
}
