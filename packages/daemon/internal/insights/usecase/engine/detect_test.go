package engine

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestDetect_DriftOverARangeReachingBeforeTheFrame_IsTimedByTheSamplesThereAre(t *testing.T) {
	const (
		step    = int64(60000)
		samples = 30
	)

	values := make([]float64, samples)
	for index := range values {
		values[index] = 10

		if index >= samples/2 {
			values[index] = 20
		}
	}

	frame := Frame{Samples: domain.Samples{StepMilliseconds: step, Values: values}}
	bound := binding{frame: frame, values: values}
	reachingBefore := signal.Range{From: -40, Until: samples - 1}

	drift := func(minimumSamples int64) domain.Condition {
		return domain.Condition{When: domain.When{Detector: domain.DetectorDrift}, Parameters: domain.DetectorParameters{
			Ratio: signal.DefaultDriftRatio, EdgeFraction: signal.DefaultEdgeFraction, MinimumEdgeSamples: signal.DefaultMinimumEdgeSamples,
			MinimumDurationMilliseconds: minimumSamples * step,
		}}
	}

	if got := detect(drift(50), bound, reachingBefore); len(got) != 0 {
		t.Errorf("detect = %+v, want nothing: thirty samples do not last the fifty the condition asks for, however far back the range reaches", got)
	}

	got := detect(drift(20), bound, reachingBefore)
	if len(got) != 1 || got[0].Onset != 0 {
		t.Errorf("detect = %+v, want one drift starting at the first sample of the frame", got)
	}
}
