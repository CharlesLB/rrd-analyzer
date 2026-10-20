package domain

import (
	"fmt"
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/failure"
)

const (
	ErrAnalysisRequired       failure.Error = "insights: a run needs the analysis it reads"
	ErrUnknownScope           failure.Error = "insights: scope must be all or viewport"
	ErrViewportWindowRequired failure.Error = "insights: a viewport run needs a window that ends after it starts"
	ErrUnknownSeries          failure.Error = "insights: no series with that identifier in this analysis"
	ErrDefaultConfiguration   failure.Error = "insights: the embedded default configuration does not parse"
)

// DefaultConfigurationFailure is the error for embedded defaults that did not parse. They ship in
// the binary, so no one can fix them by editing a file: loading fails instead of warning.
func DefaultConfigurationFailure(diagnostics []Diagnostic) error {
	details := make([]string, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		details = append(details, diagnostic.RuleID+" "+diagnostic.Detail)
	}

	return fmt.Errorf("%w: %s", ErrDefaultConfiguration, strings.Join(details, "; "))
}
