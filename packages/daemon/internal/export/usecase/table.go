package usecase

import (
	"strconv"
	"time"

	exportDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/quotient"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	minimumExportColumns = 60
	maximumExportColumns = 2000
	exportDecimals       = 4
	unitlessExportMarker = "n"
	isoTimestampLayout   = "2006-01-02T15:04:05.000Z"
	timestampHeader      = "timestamp"
)

// ExportGrid is the window an export reads and how many rows it holds: one per step of the finest
// series being exported, so nothing the file stores is averaged away, between a floor that keeps a short window
// readable and a ceiling that keeps a long one a spreadsheet can open.
//
// A row must never straddle two of the rows the file stores, or it would report a blend of two
// readings that were never taken. So the window is widened to the step boundaries around it, a
// short window splits every step into the same number of rows, and a long one gathers the same
// whole number of steps into every row, reaching a little past the window when the steps do not
// divide evenly.
func ExportGrid(exported []seriesDomain.Series, fromMilliseconds, untilMilliseconds int64) exportDomain.Grid {
	step := max(seriesDomain.SmallestOf(exported, stepOfSeries), seriesDomain.MinimumStepMilliseconds)
	from := timeunit.StartOfStep(fromMilliseconds, step)
	steps := max(quotient.RoundedUp(untilMilliseconds-from, step), 1)

	switch {
	case steps < minimumExportColumns:
		return exportDomain.Grid{FromMilliseconds: from, UntilMilliseconds: from + steps*step, Columns: int(steps * quotient.RoundedUp(minimumExportColumns, steps))}
	case steps > maximumExportColumns:
		stepsPerRow := quotient.RoundedUp(steps, maximumExportColumns)
		rows := quotient.RoundedUp(steps, stepsPerRow)

		return exportDomain.Grid{FromMilliseconds: from, UntilMilliseconds: from + rows*stepsPerRow*step, Columns: int(rows)}
	}

	return exportDomain.Grid{FromMilliseconds: from, UntilMilliseconds: from + steps*step, Columns: int(steps)}
}

// Table lays the windows out as a CSV table: a timestamp column, then one column per series named
// with its unit, a missing reading left blank.
func Table(bundle seriesDomain.Bundle, windows []seriesDomain.Window, fromMilliseconds, untilMilliseconds int64) exportDomain.Table {
	indexed := seriesDomain.IndexByID(bundle.Series)

	header := make([]string, 0, len(windows)+1)
	header = append(header, timestampHeader)
	names := make([]string, 0, len(windows))
	for _, window := range windows {
		series := indexed[window.SeriesID]
		unit := series.Unit
		if unit == "" {
			unit = unitlessExportMarker
		}

		header = append(header, series.Name+" ["+unit+"]")
		names = append(names, series.Name)
	}

	return exportDomain.Table{Header: header, Rows: rowsOf(windows, fromMilliseconds, untilMilliseconds), SeriesNames: names}
}

func rowsOf(windows []seriesDomain.Window, fromMilliseconds, untilMilliseconds int64) [][]string {
	if len(windows) == 0 {
		return nil
	}

	columns := len(windows[0].Samples)
	span := untilMilliseconds - fromMilliseconds
	rows := make([][]string, 0, columns)

	// Each row is stamped at the middle of the interval it aggregates rather than at its edge,
	// so a reading in a spreadsheet lines up with the point the chart draws.
	for column := range columns {
		instant := fromMilliseconds + span*int64(2*column+1)/int64(2*columns)

		row := make([]string, 0, len(windows)+1)
		row = append(row, time.UnixMilli(instant).UTC().Format(isoTimestampLayout))

		for _, window := range windows {
			sample := window.Samples[column]
			if !sample.Present {
				row = append(row, "")

				continue
			}

			row = append(row, strconv.FormatFloat(sample.Value, 'f', exportDecimals, 64))
		}

		rows = append(rows, row)
	}

	return rows
}
func seriesNamed(series []seriesDomain.Series, seriesIDs []string) []seriesDomain.Series {
	indexed := seriesDomain.IndexByID(series)
	named := make([]seriesDomain.Series, 0, len(seriesIDs))

	for _, seriesID := range seriesIDs {
		if found, isHeld := indexed[seriesID]; isHeld {
			named = append(named, found)
		}
	}

	return named
}

func stepOfSeries(series seriesDomain.Series) int64 {
	return series.StepMilliseconds
}
