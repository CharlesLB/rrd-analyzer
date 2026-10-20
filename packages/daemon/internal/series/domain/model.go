// Package domain holds the time-series shapes every other layer speaks in.
package domain

import (
	"cmp"
	"encoding/json"
	"math"
	"slices"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/rrdtool"
)

// The units below are the ones the application reasons about rather than only displays: they
// decide how a value is scaled, capped and formatted.
const (
	UnitPercent = "%"
	UnitBytes   = "B"
)

type Sample struct {
	Value   float64
	Present bool
}

func Known(value float64) Sample {
	return Sample{Value: value, Present: true}
}

func Unknown() Sample {
	return Sample{}
}

func (sample Sample) MarshalJSON() ([]byte, error) {
	if !isEncodable(sample) {
		return []byte("null"), nil
	}

	return json.Marshal(sample.Value)
}

func (sample *Sample) UnmarshalJSON(raw []byte) error {
	if string(raw) == "null" {
		*sample = Unknown()

		return nil
	}

	var value float64
	if err := json.Unmarshal(raw, &value); err != nil {
		return err
	}

	*sample = Known(value)

	return nil
}

type ConsolidationFunction string

const (
	ConsolidationAverage ConsolidationFunction = rrdtool.ConsolidationAverage
	ConsolidationMinimum ConsolidationFunction = rrdtool.ConsolidationMinimum
	ConsolidationMaximum ConsolidationFunction = rrdtool.ConsolidationMaximum
	ConsolidationLast    ConsolidationFunction = rrdtool.ConsolidationLast
)

func ParseConsolidationFunction(raw string) ConsolidationFunction {
	if known, ok := KnownConsolidationFunction(raw); ok {
		return known
	}

	return ConsolidationAverage
}

// KnownConsolidationFunction refuses what ParseConsolidationFunction would quietly call an
// average. An archive holding a Holt-Winters prediction or its failure flags is named by a
// consolidation this application does not plot, and reading it as an average would draw a
// forecast band as if it were measured data.
func KnownConsolidationFunction(raw string) (ConsolidationFunction, bool) {
	switch ConsolidationFunction(raw) {
	case ConsolidationAverage:
		return ConsolidationAverage, true
	case ConsolidationMinimum:
		return ConsolidationMinimum, true
	case ConsolidationMaximum:
		return ConsolidationMaximum, true
	case ConsolidationLast:
		return ConsolidationLast, true
	default:
		return ConsolidationAverage, false
	}
}

// Archive is one round robin archive as the file keeps it: its own consolidation, its own
// resolution, and only the rows it actually holds. Archives are stored side by side rather than
// projected onto one grid, so a file that keeps a year of daily readings behind a day of minutes
// costs the rows it has instead of a year of minute-wide slots.
type Archive struct {
	Function          ConsolidationFunction
	StepMilliseconds  int64
	StartMilliseconds int64
	Samples           []Sample

	// CoversIntervals says each sample consolidates the step that starts at its stamp, the way an
	// rrdtool row does, so the archive's readings reach one step past its last stamp. Without it a
	// sample is a reading taken at its stamp.
	CoversIntervals bool
}

// UntilMilliseconds is where the archive's readings end: its last stamp, or the end of the
// interval that last stamp opens.
func (archive Archive) UntilMilliseconds() int64 {
	if len(archive.Samples) == 0 {
		return archive.StartMilliseconds
	}

	last := archive.StartMilliseconds + int64(len(archive.Samples)-1)*archive.StepMilliseconds
	if archive.CoversIntervals {
		return last + archive.StepMilliseconds
	}

	return last
}

type Series struct {
	ID                string `json:"id"`
	File              string `json:"file"`
	Name              string `json:"name"`
	Label             string `json:"label"`
	Unit              string `json:"unit"`
	Color             string `json:"color"`
	DataSource        string `json:"dataSource"`
	DataSourceType    string `json:"dataSourceType"`
	StartMilliseconds int64  `json:"startMilliseconds"`
	StepMilliseconds  int64  `json:"stepMilliseconds"`

	// DataSourceMaximum is the ceiling the file declares for this data source, nil when it
	// declares none; a rule measuring a series as a percentage of its maximum reads it.
	DataSourceMaximum *float64  `json:"-"`
	Archives          []Archive `json:"-"`
}

// ArchivesFor orders the archives a read should consult, finest first. A file that keeps no
// archive for the requested consolidation still has to draw something, so the average stands in,
// and a file that keeps neither is read from whatever it does have.
func (series Series) ArchivesFor(function ConsolidationFunction) []Archive {
	matching := archivesWith(series.Archives, function)
	if len(matching) == 0 {
		matching = archivesWith(series.Archives, ConsolidationAverage)
	}
	if len(matching) == 0 {
		matching = slices.Clone(series.Archives)
	}

	slices.SortStableFunc(matching, func(left, right Archive) int { return cmp.Compare(left.StepMilliseconds, right.StepMilliseconds) })

	return matching
}

func (series Series) UntilMilliseconds() int64 {
	until := series.StartMilliseconds
	for _, archive := range series.Archives {
		until = max(until, archive.UntilMilliseconds())
	}

	return until
}

// EarliestReadingMilliseconds is the instant of the oldest reading any archive holds. rrdtool
// allocates every archive whole when it creates the file, so a year-long archive of a file written
// for a month starts eleven months before anything was stored in it.
func (series Series) EarliestReadingMilliseconds() (int64, bool) {
	earliest, found := int64(0), false

	for _, archive := range series.Archives {
		index := slices.IndexFunc(archive.Samples, func(sample Sample) bool { return sample.Present })
		if index < 0 {
			continue
		}

		instant := archive.StartMilliseconds + int64(index)*archive.StepMilliseconds
		if !found || instant < earliest {
			earliest, found = instant, true
		}
	}

	return earliest, found
}

func archivesWith(archives []Archive, function ConsolidationFunction) []Archive {
	matching := make([]Archive, 0, len(archives))
	for _, archive := range archives {
		if archive.Function == function {
			matching = append(matching, archive)
		}
	}

	return matching
}

type Bundle struct {
	AnalysisID        string         `json:"analysisId"`
	AnalysisName      string         `json:"analysisName"`
	Series            []Series       `json:"series"`
	Canvas            []PlottedChart `json:"canvas"`
	FromMilliseconds  int64          `json:"fromMilliseconds"`
	UntilMilliseconds int64          `json:"untilMilliseconds"`
}

// PlottedChart is one chart of the canvas an analysis opens on: the series it draws, first the one
// it was opened on and then the ones merged into it, in the order they were merged.
type PlottedChart struct {
	Series []PlottedSeries `json:"series"`

	// ReferenceLines names the statistics of the window this chart draws a horizontal line at, as the
	// canvas was saved with them.
	ReferenceLines []string `json:"referenceLines,omitempty"`
}

// PlottedSeries is one series a chart draws and the number of the value axis it is read against.
// The numbers are handed over as they were saved; the frontend, which lays the axes out, renumbers
// them when a series they counted from has since left the sources.
type PlottedSeries struct {
	SeriesID string `json:"seriesId"`
	Axis     int    `json:"axis"`
}

type Window struct {
	SeriesID string   `json:"seriesId"`
	Samples  []Sample `json:"samples"`
}

// wireWindow is a window as JSON carries it: a missing reading is a null, and every present one
// points into a single backing slice, so encoding a window costs two allocations instead of one per
// sample through Sample.MarshalJSON, and the numbers are written by encoding/json exactly as before.
type wireWindow struct {
	SeriesID string     `json:"seriesId"`
	Samples  []*float64 `json:"samples"`
}

func (window Window) MarshalJSON() ([]byte, error) {
	values := make([]float64, len(window.Samples))
	samples := make([]*float64, len(window.Samples))

	for index, sample := range window.Samples {
		if !isEncodable(sample) {
			continue
		}

		values[index] = sample.Value
		samples[index] = &values[index]
	}

	return json.Marshal(wireWindow{SeriesID: window.SeriesID, Samples: samples})
}

func isEncodable(sample Sample) bool {
	return sample.Present && !math.IsNaN(sample.Value) && !math.IsInf(sample.Value, 0)
}

type Statistics struct {
	Minimum      float64 `json:"minimum"`
	Maximum      float64 `json:"maximum"`
	Average      float64 `json:"average"`
	Percentile95 float64 `json:"percentile95"`
	Last         float64 `json:"last"`
	GapCount     int     `json:"gapCount"`
}

var palette = []string{
	"#005581", "#E5B800", "#3FB3E8", "#8A6D00", "#1D80AC",
	"#F2CD4E", "#123F58", "#C79B1E", "#72CDF4", "#6F94A6",
}

func ColorAt(index int) string {
	return palette[((index%len(palette))+len(palette))%len(palette)]
}

// SmallestOf is the smallest one field takes across the items, and zero when there are none. The
// first item sets the value the rest are compared against, because zero is not the identity of a
// minimum: an archive starting at the epoch would otherwise be the answer whatever it holds.
func SmallestOf[TItem any](items []TItem, valueOf func(TItem) int64) int64 {
	if len(items) == 0 {
		return 0
	}

	smallest := valueOf(items[0])
	for _, item := range items[1:] {
		smallest = min(smallest, valueOf(item))
	}

	return smallest
}

// IndexByID looks the series up by their identifiers.
func IndexByID(series []Series) map[string]Series {
	indexed := make(map[string]Series, len(series))
	for _, parsed := range series {
		indexed[parsed.ID] = parsed
	}

	return indexed
}
