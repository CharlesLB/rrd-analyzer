package signal

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"

// The parameters a rule may leave out, one group per detector.
const (
	DefaultMinimumRun = 6

	DefaultThresholdFraction = 0.25
	DefaultExcursionSamples  = 8

	DefaultDriftRatio         = 1.25
	DefaultEdgeFraction       = 0.1
	DefaultMinimumEdgeSamples = 6

	DefaultSmoothingSamples = 6
	DefaultTrendTheta       = 3
	DefaultTrendSustain     = 3

	DefaultChangePointSmoothing = 3
	DefaultChangePointTheta     = 3
	DefaultChangePointSustain   = 3

	DefaultSpikeTheta      = 5
	DefaultSpikeMaximumRun = 3

	DefaultResetDropFraction = 0.5

	DefaultFlatTolerance       = 0.01
	DefaultFlatMinimumDuration = 6 * timeunit.MillisecondsPerHour
)

// The bars each detector's episodes have to clear to count as pronounced, which feeds confidence.
const (
	pronouncedGapRuns       = 2
	pronouncedExcursionBars = 3
	pronouncedDriftBars     = 1
	pronouncedLevelBars     = 1
	pronouncedFlatRuns      = 2

	// pronouncedSlopeBars is how many times its own theta a slope or a change point has to clear to
	// count as pronounced: clearing theta once is what made it an episode at all.
	pronouncedSlopeBars = 2
)
