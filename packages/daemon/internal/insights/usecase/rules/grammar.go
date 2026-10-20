// Package rules reads the TOML rule format: it parses each rule, validates it on its own so one
// bad rule cannot take the others down, fills every default, and hashes the ruleset a run used.
package rules

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

// longestDuration bounds a duration to ten years, which no lookback or window can sensibly exceed
// and which keeps every sum far from overflowing.
const longestDuration = 3650 * timeunit.MillisecondsPerDay

var (
	errEmptyDuration     = errors.New("duration is empty")
	errUnclosedToken     = errors.New("a { opens a token that is never closed")
	errUnmatchedBrace    = errors.New("a } closes nothing; write }} for a literal brace")
	errLagNeedsTwoSides  = errors.New("a lag token names two aliases, as {from→to.lag}")
	errOnlyLagTakesPairs = errors.New("only the lag field measures between two aliases")

	aliasExpression  = `[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*`
	aliasPattern     = regexp.MustCompile(`^` + aliasExpression + `$`)
	durationPattern  = regexp.MustCompile(`^(?:\d{1,9}[smhd])+$`)
	durationSegments = regexp.MustCompile(`(\d{1,9})([smhd])`)
	comparisonWhen   = regexp.MustCompile(`^([<>])\s*([-+]?\d{1,15}(?:\.\d{1,15})?)\s*(%?)$`)
	tokenPattern     = regexp.MustCompile(`^(` + aliasExpression + `)(?:(?:→|->)(` + aliasExpression + `))?\.(base|peak|mean|onset|end|duration|lag|count|eta)$`)
	instantPattern   = regexp.MustCompile(`^(` + aliasExpression + `)\.(onset|end)(?:\s*([+-])\s*([0-9smhd]+))?$`)

	unitMilliseconds = map[string]int64{
		"s": timeunit.MillisecondsPerSecond,
		"m": timeunit.MillisecondsPerMinute,
		"h": timeunit.MillisecondsPerHour,
		"d": timeunit.MillisecondsPerDay,
	}

	namedDetectors = map[string]domain.Detector{
		string(domain.DetectorRising):      domain.DetectorRising,
		string(domain.DetectorFalling):     domain.DetectorFalling,
		string(domain.DetectorSpike):       domain.DetectorSpike,
		string(domain.DetectorGap):         domain.DetectorGap,
		string(domain.DetectorReset):       domain.DetectorReset,
		string(domain.DetectorExcursion):   domain.DetectorExcursion,
		string(domain.DetectorDrift):       domain.DetectorDrift,
		string(domain.DetectorChangePoint): domain.DetectorChangePoint,
		string(domain.DetectorFlat):        domain.DetectorFlat,
	}
)

// ParseDuration reads durations such as "15m", "7h55m" or "30d". Units are s, m, h and d, every
// segment is a whole number, and the total must be positive.
func ParseDuration(text string) (int64, error) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return 0, errEmptyDuration
	}

	if !durationPattern.MatchString(trimmed) {
		return 0, fmt.Errorf("duration %q must be whole numbers followed by s, m, h or d, as 15m or 7h55m", text)
	}

	total := int64(0)

	for _, segment := range durationSegments.FindAllStringSubmatch(trimmed, -1) {
		count, err := strconv.ParseInt(segment[1], 10, 64)
		if err != nil {
			return 0, fmt.Errorf("duration %q: %w", text, err)
		}

		total += count * unitMilliseconds[segment[2]]
		if total > longestDuration {
			return 0, fmt.Errorf("duration %q is longer than ten years", text)
		}
	}

	if total == 0 {
		return 0, fmt.Errorf("duration %q must be longer than zero", text)
	}

	return total, nil
}

// ParseWhen reads the condition grammar: a detector name, or a comparison against a level that
// may be a percentage.
func ParseWhen(text string) (domain.When, error) {
	trimmed := strings.TrimSpace(text)

	if detector, named := namedDetectors[trimmed]; named {
		return domain.When{Detector: detector}, nil
	}

	parts := comparisonWhen.FindStringSubmatch(trimmed)
	if parts == nil {
		return domain.When{}, fmt.Errorf("when %q is not one of rising, falling, spike, gap, reset, excursion, drift, change_point, flat, > X, < X, > X%%, < X%%", text)
	}

	level, err := strconv.ParseFloat(parts[2], 64)
	if err != nil {
		return domain.When{}, fmt.Errorf("when %q: %w", text, err)
	}

	return domain.When{
		Detector:   domain.DetectorThreshold,
		Comparison: domain.Comparison(parts[1]),
		Level:      level,
		Percent:    parts[3] != "",
	}, nil
}

// ParseToken reads the inside of a {…} token.
func ParseToken(text string) (domain.Token, error) {
	parts := tokenPattern.FindStringSubmatch(strings.TrimSpace(text))
	if parts == nil {
		return domain.Token{}, fmt.Errorf("token {%s} must be alias.field or from→to.lag", text)
	}

	token := domain.Token{Alias: parts[1], Field: domain.TokenField(parts[3])}
	if parts[2] != "" {
		token = domain.Token{Alias: parts[2], LagFrom: parts[1], Field: domain.TokenField(parts[3])}
	}

	switch {
	case token.Field == domain.FieldLag && token.LagFrom == "":
		return domain.Token{}, fmt.Errorf("token {%s}: %w", text, errLagNeedsTwoSides)
	case token.Field != domain.FieldLag && token.LagFrom != "":
		return domain.Token{}, fmt.Errorf("token {%s}: %w", text, errOnlyLagTakesPairs)
	}

	return token, nil
}

// ParseTemplate splits cause text into prose and tokens. Doubled braces are literal braces.
func ParseTemplate(text string) (domain.Template, error) {
	var template domain.Template

	var prose strings.Builder

	flush := func() {
		if prose.Len() > 0 {
			template = append(template, domain.TemplateSegment{Text: prose.String()})
			prose.Reset()
		}
	}

	for index := 0; index < len(text); {
		rest := text[index:]

		switch {
		case strings.HasPrefix(rest, "{{"):
			prose.WriteByte('{')
			index += 2
		case strings.HasPrefix(rest, "}}"):
			prose.WriteByte('}')
			index += 2
		case rest[0] == '{':
			closing := strings.IndexByte(rest, '}')
			if closing < 0 {
				return nil, errUnclosedToken
			}

			token, err := ParseToken(rest[1:closing])
			if err != nil {
				return nil, err
			}

			flush()
			template = append(template, domain.TemplateSegment{Token: &token})
			index += closing + 1
		case rest[0] == '}':
			return nil, errUnmatchedBrace
		default:
			prose.WriteByte(rest[0])
			index++
		}
	}

	flush()

	return template, nil
}

// ParseInstant reads one candidate edge of a finding, as "memory.onset" or "outage.onset - 3h".
func ParseInstant(text string) (domain.InstantExpression, error) {
	parts := instantPattern.FindStringSubmatch(strings.TrimSpace(text))
	if parts == nil {
		return domain.InstantExpression{}, fmt.Errorf("instant %q must be alias.onset or alias.end, optionally followed by + or - a duration", text)
	}

	expression := domain.InstantExpression{Alias: parts[1], Field: domain.TokenField(parts[2])}
	if parts[3] == "" {
		return expression, nil
	}

	offset, err := ParseDuration(parts[4])
	if err != nil {
		return domain.InstantExpression{}, fmt.Errorf("instant %q: %w", text, err)
	}

	if parts[3] == "-" {
		offset = -offset
	}

	expression.OffsetMilliseconds = offset

	return expression, nil
}

func validAlias(alias string) bool {
	return aliasPattern.MatchString(alias) && alias != domain.AliasWindow && alias != domain.AliasFinding
}
