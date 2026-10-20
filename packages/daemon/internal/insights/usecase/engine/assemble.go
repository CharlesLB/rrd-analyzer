package engine

import (
	"strconv"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/render"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

func assemble(window Window, ruleIndex, anchorOrder int, rule compiledRule, matches map[string]located, outcome joinOutcome) candidate {
	title, match, cause := rule.Title, rule.Match, rule.Cause
	if outcome.missedOptional && rule.Partial != nil {
		title, match, cause = rule.Partial.Title, rule.Partial.Match, rule.Partial.Cause
	}

	span := interval(window, rule, matches)
	finding := domain.Finding{
		RuleID:            rule.ID,
		Severity:          rule.Severity,
		Inferred:          inferred(rule, matches),
		Confidence:        confidenceOf(rule, matches, outcome),
		Match:             match,
		Title:             title,
		FromMilliseconds:  span.FromMilliseconds,
		UntilMilliseconds: span.UntilMilliseconds,
		Evidence:          evidenceOf(rule, matches),
	}

	finding.Cause = render.Cause(cause, resolver(window, matches, span))

	return candidate{ruleIndex: ruleIndex, anchorOrder: anchorOrder, rule: rule, finding: finding, matches: matches, outcome: outcome}
}

// interval is the span a finding covers: the window itself for a window rule, and otherwise the
// span of the matched episodes, with either edge replaced by the first listed instant whose alias
// matched.
func interval(window Window, rule compiledRule, matches map[string]located) Window {
	if rule.Interval == domain.IntervalWindow {
		return window
	}

	span := matchedSpan(matches)

	if from, hasFrom := firstInstant(window, rule.Onset, matches); hasFrom {
		span.FromMilliseconds = from
	}

	if until, hasUntil := firstInstant(window, rule.End, matches); hasUntil {
		span.UntilMilliseconds = until
	}

	return span
}

// matchedSpan reaches from the earliest onset to the latest end of the episodes a rule matched.
// The first episode sets both edges, because neither is a span the others can be compared against
// yet: an instant of zero is a real instant, not an empty one.
func matchedSpan(matches map[string]located) Window {
	span := Window{}
	started := false

	for _, matched := range matches {
		if !started {
			span, started = Window{FromMilliseconds: matched.onset, UntilMilliseconds: matched.end}, true

			continue
		}

		span.FromMilliseconds = min(span.FromMilliseconds, matched.onset)
		span.UntilMilliseconds = max(span.UntilMilliseconds, matched.end)
	}

	return span
}

func firstInstant(window Window, expressions []domain.InstantExpression, matches map[string]located) (int64, bool) {
	for _, expression := range expressions {
		if instant, resolved := resolveInstant(window, expression.Alias, expression.Field, matches, window); resolved {
			return instant + expression.OffsetMilliseconds, true
		}
	}

	return 0, false
}

func resolveInstant(window Window, alias string, field domain.TokenField, matches map[string]located, findingSpan Window) (int64, bool) {
	edges := func(edged Window) int64 {
		if field == domain.FieldEnd {
			return edged.UntilMilliseconds
		}

		return edged.FromMilliseconds
	}

	switch alias {
	case domain.AliasWindow:
		return edges(window), true
	case domain.AliasFinding:
		return edges(findingSpan), true
	}

	matched, found := matches[alias]
	if !found {
		return 0, false
	}

	if field == domain.FieldEnd {
		return matched.end, true
	}

	return matched.onset, true
}

func resolver(window Window, matches map[string]located, findingSpan Window) render.Resolver {
	notAvailable := render.Value(render.NotAvailable)

	return func(token domain.Token) domain.CausePart {
		switch token.Field {
		case domain.FieldLag:
			from, hasFrom := resolveInstant(window, token.LagFrom, domain.FieldOnset, matches, findingSpan)
			to, hasTo := resolveInstant(window, token.Alias, domain.FieldOnset, matches, findingSpan)
			if !hasFrom || !hasTo {
				return notAvailable
			}

			return render.Value(render.Duration(float64(to - from)))
		case domain.FieldOnset, domain.FieldEnd:
			instant, resolved := resolveInstant(window, token.Alias, token.Field, matches, findingSpan)
			if !resolved {
				return notAvailable
			}

			return render.Instant(instant)
		case domain.FieldDuration:
			onset, hasOnset := resolveInstant(window, token.Alias, domain.FieldOnset, matches, findingSpan)
			end, hasEnd := resolveInstant(window, token.Alias, domain.FieldEnd, matches, findingSpan)
			if !hasOnset || !hasEnd {
				return notAvailable
			}

			return render.Value(render.Duration(float64(end - onset)))
		case domain.FieldCount:
			matched, found := matches[token.Alias]
			if !found {
				return notAvailable
			}

			return render.Value(strconv.Itoa(max(1, matched.episode.Count)))
		case domain.FieldEta:
			matched, found := matches[token.Alias]
			if !found || !matched.episode.HasForecast {
				return notAvailable
			}

			return render.Value(render.Duration(matched.episode.SamplesToLevel * float64(matched.binding.frame.Samples.StepMilliseconds)))
		default:
			matched, found := matches[token.Alias]
			if !found {
				return notAvailable
			}

			return render.Value(render.Number(valueOf(matched.episode, token.Field), matched.binding.unit))
		}
	}
}

func valueOf(episode signal.Episode, field domain.TokenField) float64 {
	switch field {
	case domain.FieldBase:
		return episode.Base
	case domain.FieldPeak:
		return episode.Peak
	default:
		return episode.Mean
	}
}
