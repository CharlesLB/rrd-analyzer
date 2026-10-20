package engine

import (
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

const (
	labelSeparator = "_"
	semanticJoiner = "."

	// The sparkline of an episode reaches this many samples either side of it, and a gap's reaches
	// far further back: an outage says nothing on its own, and the line into it is what shows
	// whether reporting was already faltering. A read covers these margins around its window too,
	// so evidence found near an edge draws the same line it would mid-window.
	sparkLeadSamples     = 6
	sparkTrailSamples    = 6
	gapSparkLeadSamples  = 30
	gapSparkTrailSamples = 8
)

func evidenceOf(rule compiledRule, matches map[string]located) []domain.Evidence {
	evidence := make([]domain.Evidence, 0, len(rule.Evidence))

	for _, alias := range rule.Evidence {
		if matched, found := matches[alias]; found {
			evidence = append(evidence, evidenceItem(matched))
		}
	}

	return evidence
}

func evidenceItem(matched located) domain.Evidence {
	frame := matched.binding.frame
	episode := matched.episode
	series := matched.binding.series

	lead, trail := sparkLeadSamples, sparkTrailSamples
	if episode.Direction == domain.DirectionGap {
		lead, trail = gapSparkLeadSamples, gapSparkTrailSamples
	}

	item := domain.Evidence{
		Type:                    matched.binding.semanticType,
		Semantic:                SemanticOf(series.Label),
		SeriesID:                series.ID,
		Source:                  series.File,
		DataSource:              series.DataSource,
		Direction:               episode.Direction,
		FromMilliseconds:        frame.instantOf(episode.From),
		UntilMilliseconds:       frame.instantOf(episode.Until),
		Unit:                    matched.binding.unit,
		ConsolidationFunction:   frame.Samples.Function,
		StepMilliseconds:        frame.Samples.StepMilliseconds,
		ChangePointMilliseconds: frame.instantOf(episode.ChangePoint),
		Spark:                   signal.Spark(matched.binding.values, episode.From-lead, episode.Until+trail),
	}

	if episode.Direction != domain.DirectionGap && episode.Direction != domain.DirectionReset {
		item.FromValue = finite(episode.Base)
		item.ToValue = finite(episode.Peak)
	}

	return item
}

// SemanticOf is the evidence chip's name: the label without its first segment, dotted, so
// runtime_heap_objects reads heap.objects. A label with a single segment is its own name.
func SemanticOf(label string) string {
	parts := strings.Split(label, labelSeparator)
	if len(parts) < 2 {
		return label
	}

	return strings.Join(parts[1:], semanticJoiner)
}

func finite(value float64) *float64 {
	if !signal.Present(value) {
		return nil
	}

	return &value
}
