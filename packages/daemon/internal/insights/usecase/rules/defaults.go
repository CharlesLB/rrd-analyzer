package rules

import (
	_ "embed"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const defaultsOrigin = "embedded rules.toml"

//go:embed defaults/rules.toml
var defaultsDocument string

// Defaults parses the ruleset that ships in the binary. knownTypes is the classifier's taxonomy,
// the user's entries included, the same as Parse takes it.
func Defaults(knownTypes []string) ([]domain.Rule, error) {
	parsed, diagnostics := Parse([]byte(defaultsDocument), defaultsOrigin, knownTypes)
	if len(diagnostics) > 0 {
		return nil, domain.DefaultConfigurationFailure(diagnostics)
	}

	return parsed, nil
}
