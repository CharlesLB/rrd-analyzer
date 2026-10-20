package engine

// sampleRounding says which way a duration that is not a whole number of steps becomes a count of
// samples. Every duration a rule gives passes through samplesIn with one of these, so the choice is
// written at the call rather than hidden in which of several helpers was called.
type sampleRounding int

const (
	// samplesFitting is how many whole steps fit inside the duration, and none when the duration
	// is shorter than a step. It is for a span something has to stay within: a smoothing window, the
	// longest a spike may last, how far apart repeats may start, how far a lookback reaches. On data
	// too coarse for the span, repeats and a lookback find nothing rather than claim what a whole
	// step cannot show; a detector that cannot work on fewer than one sample takes one itself.
	samplesFitting sampleRounding = iota + 1

	// samplesCovering is how many steps it takes to cover the duration. It is for a span something
	// has to last at least: a gap, a level held, a reading stuck. Rounded down, an outage of twenty
	// minutes would pass for one of thirty on data kept every twenty.
	samplesCovering
)

func samplesIn(milliseconds, step int64, rounding sampleRounding) int {
	whole := milliseconds / step
	if rounding == samplesCovering && milliseconds%step > 0 {
		whole++
	}

	return int(whole)
}

// samplesFittingOr is the samples fitting a duration a rule may leave out, and the detector's own
// default when it does.
func samplesFittingOr(milliseconds, step int64, fallback int) int {
	if milliseconds <= 0 {
		return fallback
	}

	return samplesIn(milliseconds, step, samplesFitting)
}
