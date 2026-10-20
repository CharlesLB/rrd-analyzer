package domain

import (
	"math"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/quotient"
)

type RangeRequest struct {
	FromMilliseconds  int64
	UntilMilliseconds int64
	MaximumSamples    int
	Function          ConsolidationFunction
}

// RangeRead is an evenly spaced run of readings: Samples[k] stands at
// StartMilliseconds + k*StepMilliseconds. ArchiveStepMilliseconds is the step of the coarsest
// archive that supplied a reading, which is the finest instant the read can resolve whatever step
// it is laid out at.
type RangeRead struct {
	StartMilliseconds       int64
	StepMilliseconds        int64
	ArchiveStepMilliseconds int64
	Function                ConsolidationFunction
	Samples                 []Sample
}

// ValuesWithHoles is the read as the insight detectors take it. A hole becomes NaN rather than
// zero, because zero is a reading and a missing row is not.
func (read RangeRead) ValuesWithHoles() []float64 {
	values := make([]float64, len(read.Samples))
	for index, sample := range read.Samples {
		values[index] = math.NaN()
		if sample.Present {
			values[index] = sample.Value
		}
	}

	return values
}

// ReadRange lays the range out at the step of the finest archive and takes every instant from the
// finest archive whose span holds it. The fine archives reach back only days while the coarse ones
// reach back months, so a read over the whole file gets the minutes where they were kept and the
// history behind them. A hole inside an archive's span stays a hole even where a coarser archive
// holds a reading: the coarse row averages over the outage and would hide it. A range holding more
// rows than the read allows is consolidated into whole-row buckets, so a long window arrives at a
// coarser step rather than cut short, and the step it reports says which happened.
func ReadRange(series Series, request RangeRequest) RangeRead {
	archives := archivesReaching(series, request)
	if len(archives) == 0 {
		return RangeRead{Function: request.Function}
	}

	finest := archives[0]
	step := max(finest.StepMilliseconds, MinimumStepMilliseconds)
	earliest, latest := extentOf(archives)

	first := int(math.Ceil(float64(max(request.FromMilliseconds, earliest)-finest.StartMilliseconds) / float64(step)))
	last := int(math.Floor(float64(min(request.UntilMilliseconds, latest)-finest.StartMilliseconds) / float64(step)))

	read := RangeRead{
		StartMilliseconds:       finest.StartMilliseconds + int64(first)*step,
		StepMilliseconds:        step,
		ArchiveStepMilliseconds: step,
		Function:                finest.Function,
	}
	if first > last {
		return read
	}

	count := last - first + 1
	end := read.StartMilliseconds + int64(count)*step
	if request.MaximumSamples <= 0 || count <= request.MaximumSamples {
		read.Samples, read.ArchiveStepMilliseconds = readColumns(archives, read.Function, columnLayout{
			originMilliseconds:     read.StartMilliseconds,
			strideMilliseconds:     step,
			columnCount:            count,
			endMilliseconds:        end,
			finestStepMilliseconds: step,
		})

		return read
	}

	rowsPerBucket := quotient.RoundedUp(count, request.MaximumSamples)
	bucket := int64(rowsPerBucket) * step

	read.StepMilliseconds = bucket
	read.Samples, read.ArchiveStepMilliseconds = readColumns(archives, read.Function, columnLayout{
		originMilliseconds:     read.StartMilliseconds,
		widthMilliseconds:      bucket,
		strideMilliseconds:     bucket,
		columnCount:            quotient.RoundedUp(count, rowsPerBucket),
		endMilliseconds:        end,
		finestStepMilliseconds: step,
	})

	return read
}

// columnLayout places the columns of a read: column k spans widthMilliseconds from
// originMilliseconds + k*strideMilliseconds. A width of zero reads the single row under the
// column's instant. No column reaches past endMilliseconds: the last bucket of a range that does not
// divide into whole buckets is the narrower one, so it never reports a row the range left out.
type columnLayout struct {
	originMilliseconds     int64
	widthMilliseconds      int64
	strideMilliseconds     int64
	columnCount            int
	endMilliseconds        int64
	finestStepMilliseconds int64
}

func readColumns(archives []Archive, function ConsolidationFunction, layout columnLayout) ([]Sample, int64) {
	samples := make([]Sample, layout.columnCount)
	coarsest := layout.finestStepMilliseconds

	for index := range samples {
		from := layout.originMilliseconds + int64(index)*layout.strideMilliseconds
		until := min(from+layout.widthMilliseconds, layout.endMilliseconds)

		answer := archiveFor(archives, column{fromMilliseconds: float64(from), untilMilliseconds: float64(until), function: function})

		samples[index] = answer.sample
		if answer.sample.Present {
			coarsest = max(coarsest, answer.stepMilliseconds)
		}
	}

	return samples, coarsest
}

// archivesReaching picks one consolidation for the whole read, finest archive first. The requested
// one is kept while its archives reach as far back into the range as the average's do. A MAX kept
// for a day beside an AVERAGE kept for a year would otherwise cut a month-long read down to that
// day, so the average stands in, as it already does for a file that keeps no MAX at all.
func archivesReaching(series Series, request RangeRequest) []Archive {
	requested := withRows(series.ArchivesFor(request.Function))
	if request.Function == ConsolidationAverage || len(requested) == 0 {
		return requested
	}

	average := withRows(series.ArchivesFor(ConsolidationAverage))
	if len(average) == 0 {
		return requested
	}

	requestedEarliest, _ := extentOf(requested)
	averageEarliest, _ := extentOf(average)

	if requestedEarliest <= max(request.FromMilliseconds, averageEarliest) {
		return requested
	}

	return average
}

func withRows(archives []Archive) []Archive {
	kept := make([]Archive, 0, len(archives))
	for _, archive := range archives {
		if len(archive.Samples) > 0 {
			kept = append(kept, archive)
		}
	}

	return kept
}

// extentOf is the first and the last instant the archives hold a reading for. The last is inclusive,
// so an archive whose rows cover intervals ends a millisecond before the interval its last row
// closes: that end is where the next row would be stamped, and no row is.
func extentOf(archives []Archive) (int64, int64) {
	earliest, latest := archives[0].StartMilliseconds, lastInstantOf(archives[0])
	for _, archive := range archives[1:] {
		earliest = min(earliest, archive.StartMilliseconds)
		latest = max(latest, lastInstantOf(archive))
	}

	return earliest, latest
}

func lastInstantOf(archive Archive) int64 {
	if archive.CoversIntervals && len(archive.Samples) > 0 {
		return archive.UntilMilliseconds() - 1
	}

	return archive.UntilMilliseconds()
}
