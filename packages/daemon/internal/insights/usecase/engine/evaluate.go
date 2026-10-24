package engine

import (
	"cmp"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

type binding struct {
	order        int
	series       domain.SeriesInfo
	semanticType string
	frame        Frame
	values       []float64
	unit         string
}

// located is an episode placed in time. Onset and end are instants so episodes of series with
// different grids can still be ordered against each other.
type located struct {
	binding binding
	episode signal.Episode
	onset   int64
	end     int64
}

// candidate is a finding before ranking, with the matches and join outcome it was assembled from so
// a coarse finding can be measured again.
type candidate struct {
	ruleIndex   int
	anchorOrder int
	rule        compiledRule
	finding     domain.Finding
	matches     map[string]located
	outcome     joinOutcome
}

type evaluator struct {
	input    Input
	frames   frames
	window   Window
	warnings []string

	bindingsByCondition map[conditionKey][]binding
	windowEpisodes      map[conditionKey][]located
	lookbackEpisodes    map[lookbackKey][]signal.Episode
	percentages         map[percentageKey]percentage
}

type conditionKey struct {
	ruleIndex int
	alias     string
}

func newEvaluator(input Input, loaded frames, window Window) *evaluator {
	return &evaluator{
		input:               input,
		frames:              loaded,
		window:              window,
		bindingsByCondition: map[conditionKey][]binding{},
		windowEpisodes:      map[conditionKey][]located{},
		lookbackEpisodes:    map[lookbackKey][]signal.Episode{},
		percentages:         map[percentageKey]percentage{},
	}
}

func evaluate(input Input, ruleset []compiledRule, loaded frames, window Window) ([]candidate, []string) {
	return evaluateRules(input, ruleset, loaded, window, everyRule(ruleset))
}

// evaluateRules runs only the rules at ruleIndexes, keeping their places in the ruleset so a
// candidate still names its rule by the index every other pass uses.
func evaluateRules(input Input, ruleset []compiledRule, loaded frames, window Window, ruleIndexes []int) ([]candidate, []string) {
	evaluation := newEvaluator(input, loaded, window)

	var candidates []candidate

	for _, ruleIndex := range ruleIndexes {
		candidates = append(candidates, evaluation.joinRule(ruleIndex, ruleset[ruleIndex])...)
	}

	return candidates, evaluation.warnings
}

func everyRule(ruleset []compiledRule) []int {
	indexes := make([]int, len(ruleset))
	for index := range indexes {
		indexes[index] = index
	}

	return indexes
}

func (evaluation *evaluator) episodesInWindow(ruleIndex int, rule compiledRule, condition domain.Condition) []located {
	key := conditionKey{ruleIndex: ruleIndex, alias: condition.Alias}
	if cached, known := evaluation.windowEpisodes[key]; known {
		return cached
	}

	var episodes []located

	for _, bound := range evaluation.bindings(ruleIndex, rule, condition) {
		searched := signal.Range{
			From:  bound.frame.indexOf(evaluation.window.FromMilliseconds),
			Until: bound.frame.indexOf(evaluation.window.UntilMilliseconds),
		}

		episodes = append(episodes, locate(bound, detect(condition, bound, searched))...)
	}

	episodes = capAndOrder(episodes, evaluation.input.EpisodeCap)
	evaluation.windowEpisodes[key] = episodes

	return episodes
}

func locate(bound binding, episodes []signal.Episode) []located {
	placed := make([]located, 0, len(episodes))
	for _, episode := range episodes {
		placed = append(placed, located{
			binding: bound,
			episode: episode,
			onset:   bound.frame.instantOf(episode.Onset),
			end:     bound.frame.instantOf(episode.End),
		})
	}

	return placed
}

func compareLocated(left, right located) int {
	if byOnset := cmp.Compare(left.onset, right.onset); byOnset != 0 {
		return byOnset
	}

	return cmp.Compare(left.binding.order, right.binding.order)
}
