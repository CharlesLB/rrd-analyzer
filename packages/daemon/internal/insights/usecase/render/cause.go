package render

import (
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
)

const instantLayout = "2006-01-02 15:04 UTC"

// Resolver answers a token with the part that replaces it. The engine owns the episodes, so it
// owns the lookup; rendering only decides how prose and values alternate.
type Resolver func(token domain.Token) domain.CausePart

// Cause interpolates a template into parts. Adjacent prose is merged and empty prose dropped, so
// the parts always alternate the way the front renders them: prose, then a monospace value.
func Cause(template domain.Template, resolve Resolver) []domain.CausePart {
	parts := make([]domain.CausePart, 0, len(template))

	for _, segment := range template {
		part := domain.CausePart{Text: segment.Text}
		if segment.Token != nil {
			part = resolve(*segment.Token)
			part.Emphasis = true
		}

		if !part.Emphasis && part.Text == "" {
			continue
		}

		if last := len(parts) - 1; !part.Emphasis && last >= 0 && !parts[last].Emphasis {
			parts[last].Text += part.Text

			continue
		}

		parts = append(parts, part)
	}

	return parts
}

// Instant renders an onset or end for readers without the front's local clock; the front replaces
// it using InstantMilliseconds.
func Instant(milliseconds int64) domain.CausePart {
	instant := milliseconds

	return domain.CausePart{
		Text:                time.UnixMilli(milliseconds).UTC().Format(instantLayout),
		Emphasis:            true,
		InstantMilliseconds: &instant,
	}
}

func Value(text string) domain.CausePart {
	return domain.CausePart{Text: text, Emphasis: true}
}
