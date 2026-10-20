package usecase

import (
	"encoding/hex"
	"slices"
	"strings"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const (
	colorPrefix = "#"

	// colorLength is the length of a color written #rrggbb: the prefix and three bytes in hexadecimal.
	colorLength = len("#rrggbb")

	// defaultColor is the color a person picks to give a series back the one its position gives it.
	defaultColor = ""
)

// normalisedColor is a color as it is stored, in lowercase, or ErrColorInvalid for anything not
// written #rrggbb. The default color passes as it is.
func normalisedColor(color string) (string, error) {
	if color == defaultColor {
		return defaultColor, nil
	}

	if len(color) != colorLength || !strings.HasPrefix(color, colorPrefix) {
		return "", analysisDomain.ErrColorInvalid
	}

	if _, err := hex.DecodeString(color[len(colorPrefix):]); err != nil {
		return "", analysisDomain.ErrColorInvalid
	}

	return strings.ToLower(color), nil
}

// withSeriesColor is the stored colors with the one a person just picked in place of any the same
// series held before, or without it when the person picked the default color back.
//
// A stored entry names a series the way a canvas chart does, so it is the same series as the one
// recolored when both are found at the same series among the series the sources hold now, or when
// both name the same identifier and label. The second case keeps an entry from piling up for a series
// the sources no longer hold.
func withSeriesColor(stored []analysisDomain.SeriesColor, picked analysisDomain.SeriesColor, series []seriesDomain.Series) []analysisDomain.SeriesColor {
	locator := newSeriesLocator(series)
	target, isTargetHeld := locator.locate(picked.SeriesID, picked.Label)

	isSameSeries := func(entry analysisDomain.SeriesColor) bool {
		if entry.SeriesID == picked.SeriesID && entry.Label == picked.Label {
			return true
		}

		found, isFound := locator.locate(entry.SeriesID, entry.Label)

		return isTargetHeld && isFound && found.ID == target.ID
	}

	kept := slices.DeleteFunc(slices.Clone(stored), isSameSeries)
	if picked.Color == defaultColor {
		return kept
	}

	return append(kept, picked)
}

// coloredSeries lays the colors a person picked over the series. Each stored entry is found among the
// series the sources hold now the way a canvas chart is, and an entry naming a series the sources no
// longer hold is passed over. The result is a new slice, since the bundle's own is shared by every
// reader of the cache.
func coloredSeries(colors []analysisDomain.SeriesColor, series []seriesDomain.Series) []seriesDomain.Series {
	if len(colors) == 0 {
		return series
	}

	locator := newSeriesLocator(series)
	colorByID := make(map[string]string, len(colors))

	for _, entry := range colors {
		if found, isFound := locator.locate(entry.SeriesID, entry.Label); isFound {
			colorByID[found.ID] = entry.Color
		}
	}

	colored := slices.Clone(series)
	for index, one := range colored {
		if color, isColored := colorByID[one.ID]; isColored {
			colored[index].Color = color
		}
	}

	return colored
}
