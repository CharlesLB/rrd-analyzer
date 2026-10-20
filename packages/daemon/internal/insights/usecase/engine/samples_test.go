package engine

import "testing"

func TestSamplesIn_DurationThatIsNotAWholeNumberOfSteps_RoundsTheWayItWasAsked(t *testing.T) {
	const step = 15

	tests := []struct {
		name             string
		giveMilliseconds int64
		giveRounding     sampleRounding
		want             int
	}{
		{name: "fitting a whole number of steps", giveMilliseconds: 45, giveRounding: samplesFitting, want: 3},
		{name: "fitting rounds down", giveMilliseconds: 44, giveRounding: samplesFitting, want: 2},
		{name: "nothing fits a span shorter than a step", giveMilliseconds: 10, giveRounding: samplesFitting, want: 0},
		{name: "covering a whole number of steps", giveMilliseconds: 45, giveRounding: samplesCovering, want: 3},
		{name: "covering rounds up", giveMilliseconds: 31, giveRounding: samplesCovering, want: 3},
		{name: "a span shorter than a step is covered by one", giveMilliseconds: 10, giveRounding: samplesCovering, want: 1},
		{name: "no span is covered by none", giveMilliseconds: 0, giveRounding: samplesCovering, want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := samplesIn(tt.giveMilliseconds, step, tt.giveRounding); got != tt.want {
				t.Errorf("samplesIn = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestSamplesFittingOr_DurationLeftOut_IsTheDefault(t *testing.T) {
	const (
		step     = 15
		fallback = 6
	)

	if got := samplesFittingOr(0, step, fallback); got != fallback {
		t.Errorf("samplesFittingOr without a duration = %d, want the default %d", got, fallback)
	}

	if got := samplesFittingOr(45, step, fallback); got != 3 {
		t.Errorf("samplesFittingOr = %d, want the 3 steps that fit", got)
	}
}
