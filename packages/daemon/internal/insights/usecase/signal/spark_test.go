package signal_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func TestSpark_SmoothedPointsAcrossTheRange_WithHolesAsNil(t *testing.T) {
	linear := make([]float64, 60)
	for index := range linear {
		linear[index] = float64(index)
	}

	points := signal.Spark(linear, 0, 59)
	if len(points) != signal.SparkPoints || *points[0] != 1 || *points[1] != 2 || *points[25] != 58 {
		t.Errorf("Spark endpoints = %v, %v, %v; want 1, 2 and 58", *points[0], *points[1], *points[25])
	}

	withHoles := make([]float64, 60)
	copy(withHoles, linear)

	for index := 20; index <= 40; index++ {
		withHoles[index] = hole
	}

	if points := signal.Spark(withHoles, 0, 59); points[12] != nil || points[0] == nil {
		t.Errorf("Spark over holes = %v at 12 and %v at 0, want nil and a value", points[12], points[0])
	}

	for _, empty := range [][]float64{nil, holes(10)} {
		for index, point := range signal.Spark(empty, 0, 9) {
			if point != nil {
				t.Errorf("Spark of no data has %v at %d, want nil", *point, index)
			}
		}
	}

	if points := signal.Spark([]float64{1, 2, 3}, -10, 100); *points[0] != 2 {
		t.Errorf("clamped Spark starts at %v, want the mean of the three samples", *points[0])
	}
}
