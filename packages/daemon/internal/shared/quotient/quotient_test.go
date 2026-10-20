package quotient_test

import (
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/quotient"
)

func TestRoundedUp(t *testing.T) {
	tests := []struct {
		name         string
		giveDividend int64
		giveDivisor  int64
		want         int64
	}{
		{name: "an exact division", giveDividend: 12, giveDivisor: 4, want: 3},
		{name: "a remainder is one more", giveDividend: 13, giveDivisor: 4, want: 4},
		{name: "less than one divisor is one", giveDividend: 1, giveDivisor: 4, want: 1},
		{name: "nothing takes none", giveDividend: 0, giveDivisor: 4, want: 0},
		{name: "a negative dividend rounds toward zero", giveDividend: -5, giveDivisor: 4, want: -1},
		{name: "the largest dividend does not overflow", giveDividend: math.MaxInt64, giveDivisor: 2, want: math.MaxInt64/2 + 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := quotient.RoundedUp(tt.giveDividend, tt.giveDivisor); got != tt.want {
				t.Errorf("RoundedUp(%d, %d) = %d, want %d", tt.giveDividend, tt.giveDivisor, got, tt.want)
			}
		})
	}
}
