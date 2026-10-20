package usecase_test

import (
	"errors"
	"testing"
	"time"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	exportUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/usecase"
)

func TestCSVFileNameNamesTheWindowAndASingleSeries(t *testing.T) {
	from := time.Date(2026, time.August, 28, 15, 0, 0, 0, time.Local).UnixMilli()
	until := time.Date(2026, time.August, 29, 15, 0, 0, 0, time.Local).UnixMilli()

	tests := []struct {
		name string
		give []string
		want string
	}{
		{name: "one series carries its slug", give: []string{"atlas_system_cpu_user"}, want: "rrd_atlas-system-cpu-user_202608281500_202608291500.csv"},
		{name: "several series name the window only", give: []string{"atlas_system_cpu_user", "atlas_system_memory_used"}, want: "rrd_202608281500_202608291500.csv"},
		{name: "runs of symbols become one hyphen, never at an edge", give: []string{"  Disk / Used %  "}, want: "rrd_disk-used_202608281500_202608291500.csv"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := exportUsecase.CSVFileName(tt.give, from, until); got != tt.want {
				t.Errorf("CSVFileName(%q) = %q, want %q", tt.give, got, tt.want)
			}
		})
	}
}

func TestEncodeTableRefusesATableWithoutRows(t *testing.T) {
	_, err := exportUsecase.EncodeTable(exportDomain.Table{Header: []string{"timestamp"}})

	if !errors.Is(err, exportDomain.ErrNothingToExport) {
		t.Fatalf("err = %v, want %v", err, exportDomain.ErrNothingToExport)
	}
}
