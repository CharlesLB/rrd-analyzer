package usecase_test

import (
	"strings"
	"testing"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const (
	second      = 1000
	minute      = 60 * second
	hour        = 60 * minute
	fiveMinutes = 5 * minute
)

func bundleOf(series ...seriesDomain.Series) seriesDomain.Bundle {
	return seriesDomain.Bundle{Series: series}
}

func TestTableNamesEachSeriesWithItsUnitAndStampsRowsMidInterval(t *testing.T) {
	bundle := bundleOf(
		seriesDomain.Series{ID: "s0", Name: "host_cpu", Unit: "%", StepMilliseconds: fiveMinutes},
		seriesDomain.Series{ID: "s1", Name: "host_load", StepMilliseconds: fiveMinutes},
	)
	windows := []seriesDomain.Window{
		{SeriesID: "s0", Samples: []seriesDomain.Sample{seriesDomain.Known(10), seriesDomain.Known(30)}},
		{SeriesID: "s1", Samples: []seriesDomain.Sample{seriesDomain.Unknown(), seriesDomain.Known(1.5)}},
	}

	table := exportUsecase.Table(bundle, windows, 0, 600000)

	if got := strings.Join(table.Header, ","); got != "timestamp,host_cpu [%],host_load [n]" {
		t.Errorf("header = %q", got)
	}

	want := [][]string{
		{"1970-01-01T00:02:30.000Z", "10.0000", ""},
		{"1970-01-01T00:07:30.000Z", "30.0000", "1.5000"},
	}
	for index, row := range want {
		if got := strings.Join(table.Rows[index], ","); got != strings.Join(row, ",") {
			t.Errorf("row %d = %q, want %q", index, got, strings.Join(row, ","))
		}
	}

	if table.SeriesCount() != 2 || strings.Join(table.SeriesNames, ",") != "host_cpu,host_load" {
		t.Errorf("series = %d named %v", table.SeriesCount(), table.SeriesNames)
	}
}

func TestExportGridGivesEveryFinestStepWholeRowsWithinTheFloorAndCeiling(t *testing.T) {
	exported := []seriesDomain.Series{{StepMilliseconds: fiveMinutes}, {StepMilliseconds: minute}}

	tests := []struct {
		name  string
		from  int64
		until int64
		want  exportDomain.Grid
	}{
		{name: "a day at the minute", until: 24 * hour, want: exportDomain.Grid{UntilMilliseconds: 24 * hour, Columns: 1440}},
		{name: "an hour, at the floor", until: hour, want: exportDomain.Grid{UntilMilliseconds: hour, Columns: 60}},
		{
			name: "a window off the minute grid, widened to the minutes around it",
			from: 30 * second, until: 24*hour - 30*second,
			want: exportDomain.Grid{UntilMilliseconds: 24 * hour, Columns: 1440},
		},
		{
			name: "thirteen minutes, each split into the same five rows to reach the floor",
			from: minute, until: 14 * minute,
			want: exportDomain.Grid{FromMilliseconds: minute, UntilMilliseconds: 14 * minute, Columns: 65},
		},
		{
			name:  "a month, twenty-two minutes to a row under the ceiling",
			until: 30 * 24 * hour,
			want:  exportDomain.Grid{UntilMilliseconds: 1964 * 22 * minute, Columns: 1964},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := exportUsecase.ExportGrid(exported, tt.from, tt.until); got != tt.want {
				t.Errorf("ExportGrid = %+v, want %+v", got, tt.want)
			}
		})
	}
}
