package rules

import (
	"fmt"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

// structure validates what only makes sense across a whole rule: aliases, the anchor, the order
// references may point in, evidence, and every template and instant.
func (checker *checker) structure(rule *domain.Rule, document ruleDocument) {
	if rule.Trigger == nil && len(rule.Conditions) == 0 {
		checker.add(missingField, "a rule needs a trigger or at least one condition")

		return
	}

	all := rule.AllConditions()
	aliases := checker.uniqueAliases(all)
	rule.Anchor = checker.anchor(*rule, document.Anchor)

	checker.references(all, evaluationOrder(*rule))
	checker.anchorShape(all, rule.Anchor)

	rule.Evidence = checker.evidence(all, document.Evidence)
	rule.Cause = checker.requiredTemplate("cause", document.Cause, aliases)
	rule.Partial = checker.partial(*rule, document.Partial, aliases)
	rule.Onset = checker.instants("onset", document.Onset, aliases)
	rule.End = checker.instants("end", document.End, aliases)
	rule.Supersedes = checker.supersedes(rule.ID, document.Supersedes)
}

// supersedes checks the rules a rule makes redundant by id alone. Whether they exist is not asked:
// a person may drop or rename a default, and a rule superseding nothing is harmless.
func (checker *checker) supersedes(ruleID string, declared []string) []string {
	for _, superseded := range declared {
		switch {
		case !ruleIDPattern.MatchString(superseded):
			checker.add(invalidReference, fmt.Sprintf("supersedes %q is not a rule id", superseded))
		case superseded == ruleID:
			checker.add(invalidReference, "a rule cannot supersede itself")
		}
	}

	if len(declared) == 0 {
		return nil
	}

	return declared
}

func evaluationOrder(rule domain.Rule) []string {
	ordered := rule.EvaluationOrder()
	aliases := make([]string, len(ordered))

	for index, condition := range ordered {
		aliases[index] = condition.Alias
	}

	return aliases
}

func (checker *checker) uniqueAliases(all []domain.Condition) map[string]bool {
	aliases := make(map[string]bool, len(all))

	for _, condition := range all {
		if aliases[condition.Alias] {
			checker.add(duplicateAlias, fmt.Sprintf("alias %q is used by more than one condition; give each an explicit as", condition.Alias))
		}

		aliases[condition.Alias] = true
	}

	return aliases
}

func (checker *checker) anchor(rule domain.Rule, declared string) string {
	if rule.Trigger != nil {
		if declared != "" {
			checker.add(invalidReference, "anchor cannot be set on a rule with a trigger, which already anchors it")
		}

		return rule.Trigger.Alias
	}

	if declared == "" {
		return rule.Conditions[0].Alias
	}

	for _, condition := range rule.Conditions {
		if condition.Alias == declared {
			return declared
		}
	}

	checker.add(unknownAlias, fmt.Sprintf("anchor %q names no condition of this rule", declared))

	return rule.Conditions[0].Alias
}

func (checker *checker) references(all []domain.Condition, order []string) {
	position := make(map[string]int, len(order))
	edges := make(map[string][]string, len(all))

	for index, alias := range order {
		position[alias] = index
	}

	for _, condition := range all {
		edges[condition.Alias] = aliasesOf(condition)
	}

	for _, condition := range all {
		for _, reference := range referencesOf(condition) {
			if reference.alias == "" {
				continue
			}

			target, known := position[reference.alias]

			switch {
			case reference.alias == condition.Alias || reaches(edges, reference.alias, condition.Alias):
				checker.add(cyclicReference, fmt.Sprintf("condition %q: %s %q leads back to %q", condition.Alias, reference.key, reference.alias, condition.Alias))
			case !known:
				checker.add(unknownAlias, fmt.Sprintf("condition %q: %s %q names no condition of this rule", condition.Alias, reference.key, reference.alias))
			case target >= position[condition.Alias]:
				checker.add(laterAlias, fmt.Sprintf("condition %q: %s %q is evaluated after it; the anchor comes first, then conditions in declaration order", condition.Alias, reference.key, reference.alias))
			}
		}
	}
}

// aliasReference is one condition this condition names, and the key it named it with. Both the
// cycle check and the diagnostics read the same list, so a fourth reference key added to a
// condition cannot be picked up by one and missed by the other.
type aliasReference struct {
	key   string
	alias string
}

const (
	keyAfter    = "after"
	keyOverlaps = "overlaps"
	keySince    = "since"
)

func referencesOf(condition domain.Condition) []aliasReference {
	return []aliasReference{
		{key: keyAfter, alias: condition.After},
		{key: keyOverlaps, alias: condition.Overlaps},
		{key: keySince, alias: condition.Since},
	}
}

// aliasesOf is the conditions this one names, as the edges of the graph the cycle check walks.
func aliasesOf(condition domain.Condition) []string {
	var aliases []string

	for _, reference := range referencesOf(condition) {
		if reference.alias != "" {
			aliases = append(aliases, reference.alias)
		}
	}

	return aliases
}

func reaches(edges map[string][]string, from, target string) bool {
	visited := map[string]bool{}
	pending := []string{from}

	for len(pending) > 0 {
		current := pending[len(pending)-1]
		pending = pending[:len(pending)-1]

		if visited[current] {
			continue
		}

		visited[current] = true

		for _, next := range edges[current] {
			if next == target {
				return true
			}

			pending = append(pending, next)
		}
	}

	return false
}

func (checker *checker) anchorShape(all []domain.Condition, anchor string) {
	for _, condition := range all {
		if condition.Alias != anchor {
			continue
		}

		if condition.Optional {
			checker.add(invalidReference, fmt.Sprintf("the anchor %q cannot be optional: every finding hangs from it", anchor))
		}

		if condition.LookbackMilliseconds > 0 {
			checker.add(invalidReference, fmt.Sprintf("the anchor %q cannot look back: lookback is measured from the anchor", anchor))
		}

		return
	}
}

func (checker *checker) evidence(all []domain.Condition, declared []string) []string {
	aliases := make([]string, len(all))
	for index, condition := range all {
		aliases[index] = condition.Alias
	}

	if len(declared) == 0 {
		return aliases
	}

	listed := make(map[string]int, len(declared))
	for _, alias := range declared {
		listed[alias]++

		switch {
		case !slices.Contains(aliases, alias):
			checker.add(invalidEvidence, fmt.Sprintf("evidence names %q, which is no condition of this rule", alias))
		case listed[alias] == 2:
			checker.add(invalidEvidence, fmt.Sprintf("evidence lists %q more than once", alias))
		}
	}

	for _, alias := range aliases {
		if listed[alias] == 0 {
			checker.add(invalidEvidence, fmt.Sprintf("evidence leaves out %q; list every condition once", alias))
		}
	}

	return declared
}

// requiredTemplate is a template the rule format insists on, so text the document left out is a
// missing field rather than a template the rule simply does not have.
func (checker *checker) requiredTemplate(key, text string, aliases map[string]bool) domain.Template {
	if text == "" {
		checker.add(missingField, "a rule needs a "+key)

		return nil
	}

	return checker.template(key, text, aliases)
}

// template parses one piece of cause text and checks that every token in it names a condition of
// the rule. Its callers decide what text the document left out means, a missing cause or the
// rule's own cause for a partial match, so the text it is handed is never empty.
func (checker *checker) template(key, text string, aliases map[string]bool) domain.Template {
	template, err := ParseTemplate(text)
	if err != nil {
		checker.add(invalidTemplate, fmt.Sprintf("%s: %v", key, err))

		return nil
	}

	for _, segment := range template {
		if segment.Token != nil {
			checker.token(key, *segment.Token, aliases)
		}
	}

	return template
}

func (checker *checker) token(key string, token domain.Token, aliases map[string]bool) {
	for _, alias := range []string{token.LagFrom, token.Alias} {
		if alias == "" {
			continue
		}

		pseudo := alias == domain.AliasWindow || alias == domain.AliasFinding

		switch {
		case !pseudo && !aliases[alias]:
			checker.add(unresolvedToken, fmt.Sprintf("%s: token names %q, which is no condition of this rule", key, alias))
		case pseudo && (token.Field == domain.FieldBase || token.Field == domain.FieldPeak || token.Field == domain.FieldMean ||
			token.Field == domain.FieldCount || token.Field == domain.FieldEta):
			checker.add(unresolvedToken, fmt.Sprintf("%s: %s has an onset, an end and a duration, not a %s", key, alias, token.Field))
		}
	}
}

func (checker *checker) partial(rule domain.Rule, document *variantDocument, aliases map[string]bool) *domain.Variant {
	if document == nil {
		return nil
	}

	variant := &domain.Variant{Title: document.Title, Match: document.Match, Cause: rule.Cause}
	if variant.Title == "" {
		variant.Title = rule.Title
	}

	if variant.Match == "" {
		variant.Match = rule.Match
	}

	if document.Cause != "" {
		variant.Cause = checker.template("partial.cause", document.Cause, aliases)
	}

	return variant
}

func (checker *checker) instants(key string, texts []string, aliases map[string]bool) []domain.InstantExpression {
	expressions := make([]domain.InstantExpression, 0, len(texts))

	for _, text := range texts {
		expression, err := ParseInstant(text)
		if err != nil {
			checker.add(invalidInstant, fmt.Sprintf("%s: %v", key, err))

			continue
		}

		if expression.Alias != domain.AliasWindow && !aliases[expression.Alias] {
			checker.add(unknownAlias, fmt.Sprintf("%s: %q names no condition of this rule", key, expression.Alias))
		}

		expressions = append(expressions, expression)
	}

	if len(expressions) == 0 {
		return nil
	}

	return expressions
}
