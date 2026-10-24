package domain_test

import (
	"errors"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

func TestDefaultConfigurationFailure_Diagnostics_WrapTheSentinelAndNameEveryRuleAndDetail(t *testing.T) {
	diagnostics := []domain.Diagnostic{
		{RuleID: "cpu-saturation", Detail: "severity \"urgent\" is not one of critical, warning, info"},
		{RuleID: "memory-full", Detail: "a rule needs a cause"},
	}

	err := domain.DefaultConfigurationFailure(diagnostics)

	want := "insights: the embedded default configuration does not parse: " +
		"cpu-saturation severity \"urgent\" is not one of critical, warning, info; memory-full a rule needs a cause"
	if !errors.Is(err, domain.ErrDefaultConfiguration) || err.Error() != want {
		t.Errorf("DefaultConfigurationFailure = %v, want %q wrapping ErrDefaultConfiguration", err, want)
	}
}
