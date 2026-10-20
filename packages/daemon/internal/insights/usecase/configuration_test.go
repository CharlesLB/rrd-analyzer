package usecase_test

import (
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
