package rules

import "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"

const (
	diagnosticPrefix = domain.DiagnosticPrefix + "rules:"

	DiagnosticUnreadableDocument     = diagnosticPrefix + "unreadable-document"
	DiagnosticUnknownKey             = diagnosticPrefix + "unknown-key"
	DiagnosticInvalidRule            = diagnosticPrefix + "invalid-rule"
	DiagnosticDuplicateID            = diagnosticPrefix + "duplicate-id"
	DiagnosticInvalidID              = diagnosticPrefix + "invalid-id"
	DiagnosticUnknownSeverity        = diagnosticPrefix + "unknown-severity"
	DiagnosticInvalidInterval        = diagnosticPrefix + "invalid-interval"
	DiagnosticMissingField           = diagnosticPrefix + "missing-field"
	DiagnosticUnknownType            = diagnosticPrefix + "unknown-type"
	DiagnosticInvalidAlias           = diagnosticPrefix + "invalid-alias"
	DiagnosticDuplicateAlias         = diagnosticPrefix + "duplicate-alias"
	DiagnosticUnknownWhen            = diagnosticPrefix + "unknown-when"
	DiagnosticInvalidFunction        = diagnosticPrefix + "invalid-function"
	DiagnosticMalformedDuration      = diagnosticPrefix + "malformed-duration"
	DiagnosticInvalidReference       = diagnosticPrefix + "invalid-reference"
	DiagnosticUnknownAlias           = diagnosticPrefix + "unknown-alias"
	DiagnosticLaterAlias             = diagnosticPrefix + "later-alias"
	DiagnosticCycle                  = diagnosticPrefix + "cycle"
	DiagnosticParameterNotApplicable = diagnosticPrefix + "parameter-not-applicable"
	DiagnosticInvalidParameter       = diagnosticPrefix + "invalid-parameter"
	DiagnosticInvalidPercentOf       = diagnosticPrefix + "invalid-percent-of"
	DiagnosticInvalidTemplate        = diagnosticPrefix + "invalid-template"
	DiagnosticUnresolvedToken        = diagnosticPrefix + "unresolved-token"
	DiagnosticInvalidEvidence        = diagnosticPrefix + "invalid-evidence"
	DiagnosticInvalidInstant         = diagnosticPrefix + "invalid-instant"
)

var (
	unreadableDocument     = domain.DiagnosticKind{URN: DiagnosticUnreadableDocument, Title: "Rules document is not readable"}
	unknownKey             = domain.DiagnosticKind{URN: DiagnosticUnknownKey, Title: "Unknown key"}
	undecodableRule        = domain.DiagnosticKind{URN: DiagnosticInvalidRule, Title: "Rule does not decode"}
	undecodableTrigger     = domain.DiagnosticKind{URN: DiagnosticInvalidRule, Title: "Trigger does not decode"}
	invalidTrigger         = domain.DiagnosticKind{URN: DiagnosticInvalidRule, Title: "Invalid trigger"}
	duplicateID            = domain.DiagnosticKind{URN: DiagnosticDuplicateID, Title: "Duplicate rule id"}
	invalidID              = domain.DiagnosticKind{URN: DiagnosticInvalidID, Title: "Invalid rule id"}
	unknownSeverity        = domain.DiagnosticKind{URN: DiagnosticUnknownSeverity, Title: "Unknown severity"}
	unknownInterval        = domain.DiagnosticKind{URN: DiagnosticInvalidInterval, Title: "Unknown interval"}
	missingField           = domain.DiagnosticKind{URN: DiagnosticMissingField, Title: "Missing field"}
	unknownType            = domain.DiagnosticKind{URN: DiagnosticUnknownType, Title: "Unknown type"}
	invalidAlias           = domain.DiagnosticKind{URN: DiagnosticInvalidAlias, Title: "Invalid alias"}
	duplicateAlias         = domain.DiagnosticKind{URN: DiagnosticDuplicateAlias, Title: "Duplicate alias"}
	unknownWhen            = domain.DiagnosticKind{URN: DiagnosticUnknownWhen, Title: "Unknown when"}
	unknownFunction        = domain.DiagnosticKind{URN: DiagnosticInvalidFunction, Title: "Unknown consolidation function"}
	malformedDuration      = domain.DiagnosticKind{URN: DiagnosticMalformedDuration, Title: "Malformed duration"}
	invalidReference       = domain.DiagnosticKind{URN: DiagnosticInvalidReference, Title: "Invalid reference"}
	unknownAlias           = domain.DiagnosticKind{URN: DiagnosticUnknownAlias, Title: "Unknown alias"}
	laterAlias             = domain.DiagnosticKind{URN: DiagnosticLaterAlias, Title: "Reference to a later condition"}
	cyclicReference        = domain.DiagnosticKind{URN: DiagnosticCycle, Title: "Cyclic reference"}
	parameterNotApplicable = domain.DiagnosticKind{URN: DiagnosticParameterNotApplicable, Title: "Parameter does not apply"}
	invalidParameter       = domain.DiagnosticKind{URN: DiagnosticInvalidParameter, Title: "Invalid parameter"}
	invalidPercentOf       = domain.DiagnosticKind{URN: DiagnosticInvalidPercentOf, Title: "Invalid percent_of"}
	invalidTemplate        = domain.DiagnosticKind{URN: DiagnosticInvalidTemplate, Title: "Invalid template"}
	unresolvedToken        = domain.DiagnosticKind{URN: DiagnosticUnresolvedToken, Title: "Unresolved token"}
	invalidEvidence        = domain.DiagnosticKind{URN: DiagnosticInvalidEvidence, Title: "Invalid evidence order"}
	invalidInstant         = domain.DiagnosticKind{URN: DiagnosticInvalidInstant, Title: "Invalid instant"}
)
