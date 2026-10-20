package classify

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"

const (
	diagnosticPrefix = domain.DiagnosticPrefix + "classifier:"

	DiagnosticUnreadableDocument = diagnosticPrefix + "unreadable-document"
	DiagnosticUnknownKey         = diagnosticPrefix + "unknown-key"
	DiagnosticInvalidEntry       = diagnosticPrefix + "invalid-entry"
)

var (
	unreadableDocument = domain.DiagnosticKind{URN: DiagnosticUnreadableDocument, Title: "Classifier document is not readable"}
	unknownKey         = domain.DiagnosticKind{URN: DiagnosticUnknownKey, Title: "Unknown classifier key"}
	invalidEntry       = domain.DiagnosticKind{URN: DiagnosticInvalidEntry, Title: "Invalid classifier entry"}
)
