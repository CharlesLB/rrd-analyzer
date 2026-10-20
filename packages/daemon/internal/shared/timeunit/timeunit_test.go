package timeunit_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

func TestStartOfStep_InstantsAroundZero_AreTheStartOfTheStepHoldingThem(t *testing.T) {
	tests := []struct {
		name string
		give int64
		want int64
	}{
		{name: "inside a step", give: 1_234, want: 1_000},
		{name: "on a boundary", give: 2_000, want: 2_000},
		{name: "before zero", give: -1, want: -1_000},
		{name: "on a boundary before zero", give: -2_000, want: -2_000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := timeunit.StartOfStep(tt.give, 1_000); got != tt.want {
				t.Errorf("StartOfStep(%d, 1000) = %d, want %d", tt.give, got, tt.want)
			}
		})
	}
}

func TestStartOfStep_StepNotPositive_IsTheInstantItself(t *testing.T) {
	if got := timeunit.StartOfStep(1_234, 0); got != 1_234 {
		t.Errorf("StartOfStep(1234, 0) = %d, want 1234", got)
	}
}
