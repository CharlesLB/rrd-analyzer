package usecase

import (
	"context"
	"path"
	"slices"
	"strings"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

type Option interface {
	apply(*Service)
}

type unitRulesOption struct {
	rules analysisDomain.UnitRules
}

func (option unitRulesOption) apply(service *Service) { service.unitRules = option.rules }

// WithUnitRules relabels the series a person configured a unit for. Without it every series keeps
// the unit read from its name.
func WithUnitRules(rules analysisDomain.UnitRules) Option { return unitRulesOption{rules: rules} }

type noUnitRules struct{}

func (noUnitRules) Load(context.Context) []analysisDomain.UnitRule { return nil }

// withConfiguredUnits applies the first rule matching each series' name, case aside. The bundle is
// the one the cache holds, so the series are copied rather than relabelled in place.
func withConfiguredUnits(bundle seriesDomain.Bundle, rules []analysisDomain.UnitRule) seriesDomain.Bundle {
	if len(rules) == 0 {
		return bundle
	}

	relabelled := bundle
	relabelled.Series = slices.Clone(bundle.Series)

	for index, series := range relabelled.Series {
		if unit, configured := configuredUnitOf(series.Name, rules); configured {
			relabelled.Series[index].Unit = unit
		}
	}

	return relabelled
}

func configuredUnitOf(name string, rules []analysisDomain.UnitRule) (string, bool) {
	lowered := strings.ToLower(name)

	for _, rule := range rules {
		if matched, err := path.Match(strings.ToLower(rule.Pattern), lowered); err == nil && matched {
			return rule.Unit, true
		}
	}

	return "", false
}
