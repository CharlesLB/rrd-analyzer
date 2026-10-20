package engine

import (
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

type joinOutcome struct {
	missedOptional bool
	unverifiable   bool
}

// choice is the episode a condition joined, if it found one, and whether the ordering that let it
// join was finer than the data could resolve.
type choice struct {
	matched      located
	found        bool
	unverifiable bool
}

// joinRule runs the causal join. Every anchor episode opens one attempt; each further condition, in
// evaluation order, takes the earliest episode that satisfies its after, within and overlaps
// constraints, except a condition joined by overlaps alone, which takes the strongest episode
// overlapping: what drove a surge is the largest rise beside it, not whichever started first. A
// required condition with no such episode abandons the attempt, an optional one is recorded as
// unmatched and the attempt goes on.
func (evaluation *evaluator) joinRule(ruleIndex int, rule compiledRule) []candidate {
	ordered := rule.ordered
	anchor := ordered[0]

	var candidates []candidate

	for anchorOrder, anchored := range evaluation.episodesInWindow(ruleIndex, rule, anchor) {
		matches := map[string]located{anchor.Alias: anchored}
		outcome := joinOutcome{}
		complete := true

		for _, condition := range ordered[1:] {
			pool := evaluation.pool(ruleIndex, rule, condition, anchored)

			chosen := choose(condition, pool, matches)
			if !chosen.found {
				if condition.Optional {
					outcome.missedOptional = true

					continue
				}

				complete = false

				break
			}

			outcome.unverifiable = outcome.unverifiable || chosen.unverifiable
			matches[condition.Alias] = chosen.matched
		}

		if complete {
			candidates = append(candidates, assemble(evaluation.window, ruleIndex, anchorOrder, rule, matches, outcome))
		}
	}

	return candidates
}

func (evaluation *evaluator) pool(ruleIndex int, rule compiledRule, condition domain.Condition, anchored located) []located {
	if condition.LookbackMilliseconds <= 0 {
		return evaluation.episodesInWindow(ruleIndex, rule, condition)
	}

	var pool []located

	since, hasSince := evaluation.sinceInstant(ruleIndex, rule, condition, anchored)

	for _, bound := range evaluation.bindings(ruleIndex, rule, condition) {
		searched := lookbackRange(bound.frame, anchored.onset, condition.LookbackMilliseconds)

		if hasSince {
			searched.From = max(searched.From, bound.frame.indexOf(since))
		}

		pool = append(pool, locate(bound, evaluation.lookedBack(conditionKey{ruleIndex: ruleIndex, alias: condition.Alias}, condition, bound, searched))...)
	}

	return capAndOrder(pool, evaluation.input.EpisodeCap)
}

// sinceInstant is where the latest episode of the condition a lookback runs since ended before the
// anchor. When that condition is the anchor itself it is looked for on the anchor's own series: the
// restart before this one is the same process's, not another's.
func (evaluation *evaluator) sinceInstant(ruleIndex int, rule compiledRule, condition domain.Condition, anchored located) (int64, bool) {
	ordered := rule.ordered

	referenced := slices.IndexFunc(ordered, func(candidate domain.Condition) bool { return candidate.Alias == condition.Since })
	if condition.Since == "" || referenced < 0 {
		return 0, false
	}

	bindings := evaluation.bindings(ruleIndex, rule, ordered[referenced])
	if condition.Since == rule.Anchor {
		bindings = []binding{anchored.binding}
	}

	latest, found := int64(0), false

	for _, bound := range bindings {
		referencedKey := conditionKey{ruleIndex: ruleIndex, alias: ordered[referenced].Alias}
		searched := lookbackRange(bound.frame, anchored.onset, condition.LookbackMilliseconds)

		for _, episode := range evaluation.lookedBack(referencedKey, ordered[referenced], bound, searched) {
			if end := bound.frame.instantOf(episode.End); end < anchored.onset && (!found || end > latest) {
				latest, found = end, true
			}
		}
	}

	return latest, found
}

// lookbackKey names one detection a lookback asks for: a condition, on one of its series, over one
// stretch of it.
type lookbackKey struct {
	condition conditionKey
	seriesID  string
	searched  signal.Range
}

// lookedBack detects a condition's episodes on one series over a stretch before an anchor, once
// however many anchors ask. An outage is an anchor on every series it silenced, all at the same
// instant, and each of them looks back over the same stretch of the same series; a condition a
// lookback runs since is detected over that stretch again to find where it last ended. The
// episodes are shared between the callers, which read them and never write.
func (evaluation *evaluator) lookedBack(key conditionKey, condition domain.Condition, bound binding, searched signal.Range) []signal.Episode {
	memo := lookbackKey{condition: key, seriesID: bound.series.ID, searched: searched}
	if cached, known := evaluation.lookbackEpisodes[memo]; known {
		return cached
	}

	episodes := detect(condition, bound, searched)
	evaluation.lookbackEpisodes[memo] = episodes

	return episodes
}

// lookbackRange is the samples of the frame a lookback searches: those in the lookback before the
// anchor's onset, the onset itself left out.
func lookbackRange(frame Frame, anchorOnset, lookbackMilliseconds int64) signal.Range {
	onsetIndex := frame.indexOf(anchorOnset)
	lookbackSamples := samplesIn(lookbackMilliseconds, frame.Samples.StepMilliseconds, samplesFitting)

	return signal.Range{From: onsetIndex - lookbackSamples, Until: onsetIndex - 1}
}

func choose(condition domain.Condition, pool []located, matches map[string]located) choice {
	predecessor, hasPredecessor := matches[condition.After]
	if condition.After != "" && !hasPredecessor {
		return choice{}
	}

	overlapped, hasOverlapped := matches[condition.Overlaps]
	if condition.Overlaps != "" && !hasOverlapped {
		return choice{}
	}

	strongestOverlap := condition.Overlaps != "" && condition.After == ""
	strongest := choice{}

	for _, option := range pool {
		unverifiable := false

		if condition.After != "" {
			allowance, coarse := withinAllowance(condition, option, predecessor)
			if option.onset <= predecessor.onset || (allowance > 0 && option.onset > predecessor.onset+allowance) {
				continue
			}

			unverifiable = coarse
		}

		if condition.Overlaps != "" && (option.onset >= overlapped.end || option.end <= overlapped.onset) {
			continue
		}

		if !strongestOverlap {
			return choice{matched: option, found: true, unverifiable: unverifiable}
		}

		if !strongest.found || option.episode.Magnitude > strongest.matched.episode.Magnitude {
			strongest = choice{matched: option, found: true}
		}
	}

	return strongest
}

// withinAllowance is how far after its predecessor an onset may land. When the data is coarser
// than the within a rule asks for, no onset can be resolved that finely: the allowance widens to
// one bucket and the ordering is reported as unverifiable instead of silently failing or passing.
func withinAllowance(condition domain.Condition, option, predecessor located) (int64, bool) {
	step := max(option.binding.frame.resolution(), predecessor.binding.frame.resolution())
	if condition.WithinMilliseconds > 0 && step > condition.WithinMilliseconds {
		return step, true
	}

	return condition.WithinMilliseconds, false
}
