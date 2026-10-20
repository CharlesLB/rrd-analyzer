package engine

import (
	"cmp"
	"slices"
)

// regionCoarseSteps widens a pass-one candidate by this many coarse buckets on each side before it
// is re-read at the finest step, so an onset the coarse read smeared into the neighbouring bucket
// is still inside the fine region.
const regionCoarseSteps = 2

// regionSurroundingWidths widens a candidate of a rule measured against the median of the region by
// this many of its own widths on each side, when that reaches further than the coarse buckets do. A
// statistic over the region — the median an excursion
// or a percentage of the median is measured against — has to describe the stretch around the
// candidate, and a region only a few buckets wider than an hour-long surge is mostly surge: its
// median climbs with it, and the refined read drops what pass one found.
const regionSurroundingWidths = 2

// candidatesIn lists the pass-one candidates a region was built around. A candidate too wide to
// refine was never routed to a region, so it cannot drag a small region's refinement along with it.
func candidatesIn(routed []candidate, region Window) []candidate {
	var inside []candidate

	for _, found := range routed {
		if found.finding.FromMilliseconds <= region.UntilMilliseconds && found.finding.UntilMilliseconds >= region.FromMilliseconds {
			inside = append(inside, found)
		}
	}

	return inside
}

// ruleIndexesOf lists, once each and in ruleset order, the rules the candidates were found by.
func ruleIndexesOf(candidates []candidate) []int {
	indexes := make([]int, 0, len(candidates))
	for _, found := range candidates {
		indexes = append(indexes, found.ruleIndex)
	}

	slices.Sort(indexes)

	return slices.Compact(indexes)
}

func rulesAt(ruleset []compiledRule, indexes []int) []compiledRule {
	chosen := make([]compiledRule, 0, len(indexes))
	for _, index := range indexes {
		chosen = append(chosen, ruleset[index])
	}

	return chosen
}

func mergeRegions(regions []Window) []Window {
	sorted := slices.Clone(regions)
	slices.SortFunc(sorted, func(left, right Window) int { return cmp.Compare(left.FromMilliseconds, right.FromMilliseconds) })

	var merged []Window

	for _, region := range sorted {
		if last := len(merged) - 1; last >= 0 && region.FromMilliseconds <= merged[last].UntilMilliseconds {
			merged[last].UntilMilliseconds = max(merged[last].UntilMilliseconds, region.UntilMilliseconds)

			continue
		}

		merged = append(merged, region)
	}

	return merged
}

func widestStep(loaded frames) int64 {
	widest := int64(1)
	for _, frame := range loaded {
		widest = max(widest, frame.Samples.StepMilliseconds)
	}

	return widest
}
