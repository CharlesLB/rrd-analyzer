package domain

import (
	"math"
	"slices"
)

// MinimumColumns is the narrowest grid the aggregator will draw: it divides the window by the
// column count, so a request for none has nothing to divide by. MinimumStepMilliseconds is the
// shortest step it will divide by, for the same reason. Both are exported because the layers that
// size a request — the analysis service, the export grid, the insights engine — have to keep
// inside them, and a second copy of either would let one widen while the other stayed behind.
const (
	MinimumColumns          = 1
	MinimumStepMilliseconds = 1

	percentileRank   = 0.95
	shortestInterval = 1
)

type AggregationRequest struct {
	FromMilliseconds  int64
	UntilMilliseconds int64
	Columns           int
	Function          ConsolidationFunction
}

func Aggregate(series Series, request AggregationRequest) []Sample {
	archives := withRows(series.ArchivesFor(request.Function))

	columns := max(request.Columns, MinimumColumns)

	span := float64(request.UntilMilliseconds - request.FromMilliseconds)
	origin := float64(request.FromMilliseconds)

	out := make([]Sample, columns)
	for index := range out {
		from := origin + span*float64(index)/float64(columns)
		until := origin + span*float64(index+1)/float64(columns)

		out[index] = archiveFor(archives, column{fromMilliseconds: from, untilMilliseconds: until, function: request.Function}).sample
	}

	return out
}

// consolidateArchive reads the rows stamped inside the column: from the first row at or after the
// column's start up to the last row before its end, and
// always at least one row, so a column narrower than the step still shows the reading under it.
func consolidateArchive(archive Archive, fromMilliseconds, untilMilliseconds float64, function ConsolidationFunction) Sample {
	start := float64(archive.StartMilliseconds)
	step := math.Max(float64(archive.StepMilliseconds), MinimumStepMilliseconds)

	firstIndex := int(math.Floor((fromMilliseconds - start) / step))
	lastIndex := int(math.Ceil((untilMilliseconds - start) / step))
	if lastIndex <= firstIndex {
		lastIndex = firstIndex + shortestInterval
	}

	// Only the rows the archive stores can hold a reading, so the span is clamped to them: a column
	// reaching years past the archive's ends would otherwise walk every missing step in between.
	firstStored := min(max(firstIndex, 0), len(archive.Samples))
	lastStored := max(min(lastIndex, len(archive.Samples)), firstStored)

	return consolidate(archive.Samples[firstStored:lastStored], function)
}

func consolidate(samples []Sample, function ConsolidationFunction) Sample {
	accumulator := 0.0
	count := 0

	for _, sample := range samples {
		if !sample.Present {
			continue
		}

		count++
		if count == 1 {
			accumulator = sample.Value

			continue
		}

		switch function {
		case ConsolidationMaximum:
			accumulator = math.Max(accumulator, sample.Value)
		case ConsolidationMinimum:
			accumulator = math.Min(accumulator, sample.Value)
		case ConsolidationLast:
			accumulator = sample.Value
		default:
			accumulator += sample.Value
		}
	}

	if count == 0 {
		return Unknown()
	}

	if function == ConsolidationAverage {
		return Known(accumulator / float64(count))
	}

	return Known(accumulator)
}

// Summarise sums the readings in ascending order, as the reference does, so the average agrees
// with it to the last bit rather than to a rounding error.
func Summarise(samples []Sample) (Statistics, bool) {
	present := make([]float64, 0, len(samples))
	for _, sample := range samples {
		if sample.Present {
			present = append(present, sample.Value)
		}
	}

	if len(present) == 0 {
		return Statistics{}, false
	}

	last := present[len(present)-1]
	slices.Sort(present)

	sum := 0.0
	for _, value := range present {
		sum += value
	}

	percentileIndex := min(int(math.Floor(float64(len(present))*percentileRank)), len(present)-1)

	return Statistics{
		Minimum:      present[0],
		Maximum:      present[len(present)-1],
		Average:      sum / float64(len(present)),
		Percentile95: present[percentileIndex],
		Last:         last,
		GapCount:     len(samples) - len(present),
	}, true
}
