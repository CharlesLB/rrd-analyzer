package domain_test

import (
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

func TestSeverityRank_EachSeverity_SortsMostUrgentFirstAndAnUnknownOneLast(t *testing.T) {
	tests := []struct {
		name string
		give domain.Severity
		want int
	}{
		{name: "critical", give: domain.SeverityCritical, want: 0},
		{name: "warning", give: domain.SeverityWarning, want: 1},
		{name: "info", give: domain.SeverityInfo, want: 2},
		{name: "unknown", give: domain.Severity("urgent"), want: 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.give.Rank(); got != tt.want {
				t.Errorf("Rank(%q) = %d, want %d", tt.give, got, tt.want)
			}
		})
	}
}
