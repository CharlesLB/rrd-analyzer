package signal

// runsWhere splits a range into the maximal runs of consecutive indexes the predicate holds for.
// It is how a detector looking for a sustained condition — a stretch of holes, of readings past a
// level, of readings that barely move — turns a test on one sample into the episodes it reports.
func runsWhere(searched Range, predicate func(index int) bool) []Range {
	var runs []Range

	start := -1
	for index := searched.From; index <= searched.Until; index++ {
		if predicate(index) {
			if start < 0 {
				start = index
			}

			continue
		}

		if start >= 0 {
			runs = append(runs, Range{From: start, Until: index - 1})
		}

		start = -1
	}

	if start >= 0 {
		runs = append(runs, Range{From: start, Until: searched.Until})
	}

	return runs
}
