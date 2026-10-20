package rules

import (
	"fmt"
	"regexp"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/strict"
)

var ruleIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)

// Parse reads a rules document. Each rule is decoded and validated on its own: a rule with any
// problem is left out and reported, one diagnostic per problem, and every other rule still loads.
// knownTypes is the classifier's taxonomy; system.down is always known.
func Parse(content []byte, origin string, knownTypes []string) ([]domain.Rule, []domain.Diagnostic) {
	tables, unknownKeys, err := strict.Tables(content, documentArrayKey)
	if err != nil {
		unreadable := unreadableDocument.Raise(err.Error())
		unreadable.Origin = origin

		return nil, []domain.Diagnostic{unreadable}
	}

	known := map[string]bool{domain.TypeSystemDown: true}
	for _, knownType := range knownTypes {
		known[knownType] = true
	}

	diagnostics := make([]domain.Diagnostic, 0, len(unknownKeys))
	for _, key := range unknownKeys {
		unknown := unknownKey.Raise(fmt.Sprintf("top-level key %q is not part of the rules format", key))
		unknown.Origin = origin
		diagnostics = append(diagnostics, unknown)
	}

	parsed := make([]domain.Rule, 0, len(tables))
	seen := make(map[string]bool, len(tables))

	for position, table := range tables {
		rule, problems := parseRule(table, known)
		if len(problems) == 0 && seen[rule.ID] {
			problems = append(problems, duplicateID.Raise(fmt.Sprintf("rule id %q is already defined in this document", rule.ID)))
		}

		if len(problems) == 0 {
			seen[rule.ID] = true
			parsed = append(parsed, rule)

			continue
		}

		for _, rejected := range problems {
			rejected.Origin = origin
			rejected.RuleID = rule.ID
			if rule.ID == "" {
				rejected.Detail = fmt.Sprintf("rule #%d: %s", position+1, rejected.Detail)
			}

			diagnostics = append(diagnostics, rejected)
		}
	}

	return parsed, diagnostics
}

func parseRule(table map[string]any, knownTypes map[string]bool) (domain.Rule, []domain.Diagnostic) {
	stripped, triggerRaw, percentOfs := extractUntyped(table)
	identifier, _ := table["id"].(string)

	var document ruleDocument

	unknownKeys, err := strict.Decode(stripped, &document)
	if err != nil {
		return domain.Rule{ID: identifier}, []domain.Diagnostic{undecodableRule.Raise(err.Error())}
	}

	checker := &checker{knownTypes: knownTypes}
	for _, key := range unknownKeys {
		checker.add(unknownKey, fmt.Sprintf("key %q is not part of the rule format", key))
	}

	rule := checker.header(document)
	rule.Trigger = checker.trigger(triggerRaw)

	for index, conditionDocument := range document.Condition {
		var percentOf any
		if index < len(percentOfs) {
			percentOf = percentOfs[index]
		}

		rule.Conditions = append(rule.Conditions, checker.condition(conditionDocument, percentOf, fmt.Sprintf("condition #%d", index+1)))
	}

	checker.structure(&rule, document)

	return rule, checker.problems
}

type checker struct {
	knownTypes map[string]bool
	problems   []domain.Diagnostic
}

func (checker *checker) add(kind domain.DiagnosticKind, detail string) {
	checker.problems = append(checker.problems, kind.Raise(detail))
}

func (checker *checker) header(document ruleDocument) domain.Rule {
	rule := domain.Rule{
		ID:       document.ID,
		Severity: domain.Severity(document.Severity),
		Title:    document.Title,
		Match:    document.Match,
		Inferred: document.Inferred,
		Interval: domain.IntervalMode(document.Interval),
	}

	if !ruleIDPattern.MatchString(document.ID) {
		checker.add(invalidID, fmt.Sprintf("id %q must be lower-case letters, digits, '.', '_' or '-'", document.ID))
	}

	switch rule.Severity {
	case domain.SeverityCritical, domain.SeverityWarning, domain.SeverityInfo:
	default:
		checker.add(unknownSeverity, fmt.Sprintf("severity %q must be critical, warning or info", document.Severity))
	}

	switch rule.Interval {
	case "":
		rule.Interval = domain.IntervalEpisodes
	case domain.IntervalEpisodes, domain.IntervalWindow:
	default:
		checker.add(unknownInterval, fmt.Sprintf("interval %q must be episodes or window", document.Interval))
	}

	if document.Title == "" {
		checker.add(missingField, "a rule needs a title")
	}

	return rule
}

func (checker *checker) trigger(raw any) *domain.Condition {
	switch value := raw.(type) {
	case nil:
		return nil
	case string:
		condition := checker.condition(conditionDocument{Type: value}, nil, triggerKey)

		return &condition
	case map[string]any:
		cleaned, percentOf := withoutPercentOf(value)

		var document conditionDocument

		unknownKeys, err := strict.Decode(cleaned, &document)
		if err != nil {
			checker.add(undecodableTrigger, err.Error())

			return nil
		}

		for _, key := range unknownKeys {
			checker.add(unknownKey, fmt.Sprintf("key %q is not part of the trigger format", triggerKey+"."+key))
		}

		condition := checker.condition(document, percentOf, triggerKey)

		return &condition
	default:
		checker.add(invalidTrigger, "trigger must be a semantic type or a condition table")

		return nil
	}
}
