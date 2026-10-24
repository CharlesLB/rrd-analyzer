package infrastructure_test

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
)

func writeUnits(t *testing.T, directory string, content string, modified time.Time) {
	t.Helper()

	path := filepath.Join(directory, analysisInfra.UnitsFileName)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write units: %v", err)
	}

	if err := os.Chtimes(path, modified, modified); err != nil {
		t.Fatalf("date units: %v", err)
	}
}

func TestUnitRulesLoad_ReadsEveryWellFormedEntryInOrder(t *testing.T) {
	directory := t.TempDir()
	writeUnits(t, directory, `
[[unit]]
series = "*_rate"
unit = "ops/s"

[[unit]]
series = "goroutines"
unit = ""

[[unit]]
series = "[broken"
unit = "x"

[[unit]]
unit = "no pattern"

[[unit]]
series = "no_unit"
`, time.Now())

	got := analysisInfra.NewUnitRulesLoader(directory).Load(context.Background())

	want := []analysisDomain.UnitRule{{Pattern: "*_rate", Unit: "ops/s"}, {Pattern: "goroutines", Unit: ""}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("rules = %+v, want %+v", got, want)
	}
}

func TestUnitRulesLoad_AMissingOrMalformedFile_HoldsNoRules(t *testing.T) {
	tests := []struct {
		name        string
		giveContent string
	}{
		{name: "missing"},
		{name: "not toml", giveContent: "[[unit]\nseries ="},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			directory := t.TempDir()
			if tt.giveContent != "" {
				writeUnits(t, directory, tt.giveContent, time.Now())
			}

			if got := analysisInfra.NewUnitRulesLoader(directory).Load(context.Background()); len(got) != 0 {
				t.Errorf("rules = %+v, want none", got)
			}
		})
	}
}

func TestUnitRulesLoad_AnEditedFile_IsReadAgain(t *testing.T) {
	directory := t.TempDir()
	loader := analysisInfra.NewUnitRulesLoader(directory)
	writeUnits(t, directory, "[[unit]]\nseries = \"a\"\nunit = \"ms\"\n", time.Now().Add(-time.Hour))
	_ = loader.Load(context.Background())

	writeUnits(t, directory, "[[unit]]\nseries = \"a\"\nunit = \"seconds\"\n", time.Now())

	got := loader.Load(context.Background())
	if len(got) != 1 || got[0].Unit != "seconds" {
		t.Errorf("rules after the edit = %+v, want the edited unit", got)
	}
}

func TestUnitRulesLoad_AFolderInPlaceOfTheFile_HoldsNoRules(t *testing.T) {
	directory := t.TempDir()
	if err := os.Mkdir(filepath.Join(directory, analysisInfra.UnitsFileName), 0o700); err != nil {
		t.Fatalf("make the folder: %v", err)
	}

	if got := analysisInfra.NewUnitRulesLoader(directory).Load(context.Background()); len(got) != 0 {
		t.Errorf("rules = %+v, want none", got)
	}
}

func TestUnitRulesLoad_NoConfigurationDirectoryOrACallerThatHasGone_HoldsNoRules(t *testing.T) {
	directory := t.TempDir()
	writeUnits(t, directory, "[[unit]]\nseries = \"a\"\nunit = \"ms\"\n", time.Now())

	gone, leave := context.WithCancel(context.Background())
	leave()

	tests := []struct {
		name          string
		giveDirectory string
		giveContext   context.Context
	}{
		{name: "no configuration directory", giveContext: context.Background()},
		{name: "a caller that has gone", giveDirectory: directory, giveContext: gone},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := analysisInfra.NewUnitRulesLoader(tt.giveDirectory).Load(tt.giveContext); len(got) != 0 {
				t.Errorf("rules = %+v, want none", got)
			}
		})
	}
}
