package usecase

import (
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

// seriesLocator finds the series a stored analysis names among the series its sources hold now, and
// hands each one out once. The canvas and the chart library are both stored that way, so both are
// restored through one of these.
//
// A series is stored by its position in the bundle together with its label, and the position alone
// moves under it: a file that gains or loses a data source, or a source added to the analysis,
// shifts every series behind it, and a stored canvas or library order would then name other series
// than the ones it was saved with. So a series is taken at its stored position only while the label
// there still matches, and otherwise wherever the one series with that label now sits.
type seriesLocator struct {
	byID    map[string]seriesDomain.Series
	byLabel map[string][]string
	claimed map[string]bool
}

func newSeriesLocator(series []seriesDomain.Series) *seriesLocator {
	byLabel := make(map[string][]string, len(series))
	for _, parsed := range series {
		byLabel[parsed.Label] = append(byLabel[parsed.Label], parsed.ID)
	}

	return &seriesLocator{
		byID:    seriesDomain.IndexByID(series),
		byLabel: byLabel,
		claimed: make(map[string]bool, len(series)),
	}
}

// claim is the series a stored identifier and label name, which from then on is claimed. It finds
// nothing for a series the sources no longer hold, for a label that now names several series, and
// for a series already claimed.
func (locator *seriesLocator) claim(seriesID string, label string) (seriesDomain.Series, bool) {
	found, isFound := locator.locate(seriesID, label)
	if !isFound || locator.claimed[found.ID] {
		return seriesDomain.Series{}, false
	}

	locator.claimed[found.ID] = true

	return found, true
}

func (locator *seriesLocator) isClaimed(seriesID string) bool {
	return locator.claimed[seriesID]
}

func (locator *seriesLocator) locate(seriesID string, label string) (seriesDomain.Series, bool) {
	atPosition, isHeld := locator.byID[seriesID]
	if isHeld && (label == "" || atPosition.Label == label) {
		return atPosition, true
	}

	sameLabel := locator.byLabel[label]
	if len(sameLabel) != 1 {
		return seriesDomain.Series{}, false
	}

	return locator.byID[sameLabel[0]], true
}
