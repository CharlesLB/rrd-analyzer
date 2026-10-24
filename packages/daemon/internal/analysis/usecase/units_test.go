package usecase_test

import (
	"context"
	"testing"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisUsecase "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/usecase"
)

type editableUnitRules struct{ rules []analysisDomain.UnitRule }

func (rules *editableUnitRules) Load(context.Context) []analysisDomain.UnitRule { return rules.rules }

func unitsOf(t *testing.T, service *analysisUsecase.Service, analysisID string) []string {
	t.Helper()

	bundle, err := service.Bundle(context.Background(), analysisID)
	if err != nil {
		t.Fatalf("bundle: %v", err)
	}

	units := make([]string, 0, len(bundle.Series))
	for _, series := range bundle.Series {
		units = append(units, series.Unit)
	}

	return units
}

func TestBundle_ConfiguredUnits_RelabelTheFirstMatchingSeriesAndFollowAnEdit(t *testing.T) {
	rules := &editableUnitRules{rules: []analysisDomain.UnitRule{
		{Pattern: "HOST_D*", Unit: "B"},
		{Pattern: "host_*", Unit: "ops/s"},
	}}
	service := analysisUsecase.NewService(&memoryStore{}, labelledLoader{labels: []string{"disk", "cpu"}}, fixedClock{}, analysisUsecase.WithUnitRules(rules))
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	if got := unitsOf(t, service, created.ID); got[0] != "B" || got[1] != "ops/s" {
		t.Errorf("units = %q, want the first rule matching each name, case aside", got)
	}

	rules.rules = nil

	if got := unitsOf(t, service, created.ID); got[0] != "" || got[1] != "" {
		t.Errorf("units after the rules were removed = %q, want the parsed units back, the cached series untouched", got)
	}
}

func TestBundle_ConfiguredUnitsMatchingNoSeries_LeaveTheParsedUnits(t *testing.T) {
	rules := &editableUnitRules{rules: []analysisDomain.UnitRule{{Pattern: "elasticsearch_*", Unit: "ops/s"}}}
	service := analysisUsecase.NewService(&memoryStore{}, &twoPointLoader{}, fixedClock{}, analysisUsecase.WithUnitRules(rules))
	created, _ := service.Create(context.Background(), "Capacity", []analysisDomain.SourceFile{{Name: "a.rrd"}})

	if got := unitsOf(t, service, created.ID); len(got) != 1 || got[0] != "%" {
		t.Errorf("units = %q, want the %% parsed from the file", got)
	}
}
