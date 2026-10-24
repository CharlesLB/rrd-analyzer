package usecase_test

import (
	"encoding/json"
	"errors"
	"math"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/rules"
)

const (
	userClassifierOrigin = "/config/classifier.toml"
	userRulesOrigin      = "/config/rules.toml"
)

func TestAssembleConfiguration_NoUserFiles_IsTheDefaultsWithoutDiagnostics(t *testing.T) {
	configuration, err := usecase.AssembleConfiguration(usecase.UserFiles{
		Classifier: usecase.UserFile{Origin: userClassifierOrigin},
		Rules:      usecase.UserFile{Origin: userRulesOrigin},
	})
	if err != nil {
		t.Fatalf("assemble: %v", err)
	}

	defaultEntries, err := classify.Defaults()
	if err != nil {
		t.Fatalf("default classifier: %v", err)
	}

	defaultRules, err := rules.Defaults(classify.Types(defaultEntries))
	if err != nil {
		t.Fatalf("default rules: %v", err)
	}

	if len(configuration.Diagnostics) != 0 || len(configuration.Rules) != len(defaultRules) || len(configuration.Classifier) != len(defaultEntries) {
		t.Fatalf("%d rules, %d entries, diagnostics %+v; want the %d default rules and %d default entries alone",
			len(configuration.Rules), len(configuration.Classifier), configuration.Diagnostics, len(defaultRules), len(defaultEntries))
	}
}

func TestAssembleConfiguration_UnreadableClassifierAndMalformedRules_ReportsTheClassifierFirst(t *testing.T) {
	unreadable := &domain.Diagnostic{Type: "urn:test:unreadable", Title: "Unreadable", Detail: "permission denied", Origin: userClassifierOrigin}

	configuration, err := usecase.AssembleConfiguration(usecase.UserFiles{
		Classifier: usecase.UserFile{Origin: userClassifierOrigin, Unreadable: unreadable},
		Rules:      usecase.UserFile{Origin: userRulesOrigin, Content: []byte("[[rule]\nid = ")},
	})
	if err != nil {
		t.Fatalf("assemble: %v", err)
	}

	diagnostics := configuration.Diagnostics
	if len(diagnostics) != 2 || diagnostics[0] != *unreadable || diagnostics[1].Type != rules.DiagnosticUnreadableDocument || diagnostics[1].Origin != userRulesOrigin {
		t.Fatalf("diagnostics = %+v, want the classifier's read failure, then the rules document's", diagnostics)
	}
}

func failingClassifier() ([]domain.ClassifierEntry, error) {
	return nil, errInducedFailure
}

func failingRuleset([]string) ([]domain.Rule, error) {
	return nil, errInducedFailure
}

func TestAssembleConfiguration_DefaultsThatDoNotLoad_FailTheAssembly(t *testing.T) {
	tests := []struct {
		name       string
		classifier func() ([]domain.ClassifierEntry, error)
		ruleset    func(knownTypes []string) ([]domain.Rule, error)
	}{
		{name: "the classifier", classifier: failingClassifier, ruleset: rules.Defaults},
		{name: "the ruleset", classifier: classify.Defaults, ruleset: failingRuleset},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := usecase.AssembleConfigurationOver(tt.classifier, tt.ruleset, usecase.UserFiles{})
			if !errors.Is(err, errInducedFailure) {
				t.Errorf("assemble error = %v, want the defaults' failure", err)
			}
		})
	}
}

func TestAssembleConfiguration_DefaultRuleWithANonFiniteLevel_FailsToHashTheRuleset(t *testing.T) {
	nonFinite := func([]string) ([]domain.Rule, error) {
		return []domain.Rule{{ID: "unhashable", Conditions: []domain.Condition{{When: domain.When{Level: math.NaN()}}}}}, nil
	}

	_, err := usecase.AssembleConfigurationOver(classify.Defaults, nonFinite, usecase.UserFiles{})

	var unsupported *json.UnsupportedValueError
	if !errors.As(err, &unsupported) {
		t.Errorf("assemble error = %v, want the encoding failure of the NaN level", err)
	}
}
