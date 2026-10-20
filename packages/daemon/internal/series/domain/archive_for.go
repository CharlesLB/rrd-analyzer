package domain

// column is one stretch of time a read wants a single value for, half open: it holds its start and
// not its end. A column of no width is the single instant at its start.
type column struct {
	fromMilliseconds  float64
	untilMilliseconds float64
	function          ConsolidationFunction
}

// columnAnswer is what the archive chosen for a column holds over it, and the step of that archive,
// which is the finest the answer can resolve. No archive answering leaves both zero.
type columnAnswer struct {
	sample           Sample
	stepMilliseconds int64
}

// archiveFor asks the finest archive first and falls through to a coarser one only where the finer
// one neither holds a reading in the column nor holds the whole column. The fine archives reach back
// only days while the coarse ones reach back months, so a column older than the fine archive, or
// one lying across its first row with nothing fine in it, reads the history behind it and the two
// read as one line. A hole inside the fine archive stays a hole: the coarse row averages over the
// outage and would hide it.
//
// The chart and the range read the insights engine takes both choose with this one rule. They used
// to choose apart, and across the first row of a fine archive the chart drew the coarse value where
// the engine read a gap: a finding then described data the chart under it did not show.
func archiveFor(archives []Archive, span column) columnAnswer {
	for _, archive := range archives {
		sample := consolidateArchive(archive, span.fromMilliseconds, span.untilMilliseconds, span.function)
		if sample.Present || holdsColumn(archive, span) {
			return columnAnswer{sample: sample, stepMilliseconds: archive.StepMilliseconds}
		}
	}

	return columnAnswer{}
}

// holdsColumn says the column lies wholly inside the archive's span, from its first instant to its
// last. The last instant of a column with any width is just short of its end, and of one with none
// it is the instant itself, which is what lets a single rule serve a chart column and a row read at
// one instant alike.
func holdsColumn(archive Archive, span column) bool {
	lastInstant := max(span.fromMilliseconds, span.untilMilliseconds-shortestInterval)

	return float64(archive.StartMilliseconds) <= span.fromMilliseconds && lastInstant <= float64(lastInstantOf(archive))
}
