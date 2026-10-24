package domain_test

import (
	"testing"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
)

func TestTableSeriesCount(t *testing.T) {
	tests := []struct {
		name string
		give exportDomain.Table
		want int
	}{
		{name: "no header at all", give: exportDomain.Table{}, want: 0},
		{name: "only the timestamp column", give: exportDomain.Table{Header: []string{"timestamp"}}, want: 0},
		{name: "a column after the timestamp per series", give: exportDomain.Table{Header: []string{"timestamp", "host_cpu [%]", "host_load [n]"}}, want: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.give.SeriesCount(); got != tt.want {
				t.Errorf("SeriesCount = %d, want %d", got, tt.want)
			}
		})
	}
}
