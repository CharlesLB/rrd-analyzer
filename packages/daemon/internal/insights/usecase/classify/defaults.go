package classify

import (
	_ "embed"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const defaultsOrigin = "embedded classifier.toml"

//go:embed defaults/classifier.toml
var defaultsDocument string

// Defaults parses the classifier that ships in the binary.
func Defaults() ([]domain.ClassifierEntry, error) {
	entries, diagnostics := Parse([]byte(defaultsDocument), defaultsOrigin)
	if len(diagnostics) > 0 {
		return nil, domain.DefaultConfigurationFailure(diagnostics)
	}

	return entries, nil
}
