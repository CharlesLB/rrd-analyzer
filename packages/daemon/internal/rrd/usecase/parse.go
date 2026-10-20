// Package usecase turns an RRD database into the series the analyzer plots.
package usecase

import (
	"encoding/xml"
	"fmt"
	"math"
	"path/filepath"
	"strconv"
	"strings"

	rrdDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/rrd/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/metricname"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	computeSourceType = "COMPUTE"
)

type xmlDump struct {
	StepSeconds       int64           `xml:"step"`
	LastUpdateSeconds int64           `xml:"lastupdate"`
	DataSources       []xmlDataSource `xml:"ds"`
	Archives          []xmlArchive    `xml:"rra"`
}

type xmlDataSource struct {
	Name    string `xml:"name"`
	Type    string `xml:"type"`
	Maximum string `xml:"max"`
}

type xmlArchive struct {
	Function            string   `xml:"cf"`
	PrimaryPointsPerRow int64    `xml:"pdp_per_row"`
	Rows                []xmlRow `xml:"database>row"`
}

type xmlRow struct {
	Values []string `xml:"v"`
}

// ParseDump reads either a binary round robin database or the XML an rrdtool dump writes, and
// keeps every archive at the resolution the file stored it in. Nothing is resampled here: a read
// picks the archive it wants, so a year of daily history costs a year of daily rows rather than a
// year of minute-wide slots.
func ParseDump(content []byte, sourcePath string) ([]seriesDomain.Series, error) {
	database, err := decodeDatabase(content, sourcePath)
	if err != nil {
		return nil, err
	}

	if database.StepSeconds <= 0 || len(database.DataSources) == 0 {
		return nil, fmt.Errorf("%q: %w", sourcePath, rrdDomain.ErrNotAnRRDDump)
	}

	return seriesOf(database, sourcePath)
}

// IsSource says whether the bytes are an RRD source: a binary database, known by the cookie rrdtool
// opens every one with, or XML that reads as a dump. The cookie alone is enough for a database,
// including the layouts only rrdtool can read, because the question is whether the file is an RRD
// and not whether this build can plot it. For XML there is no such mark, and any document opens
// with the same character, so a dump has to parse as one.
func IsSource(content []byte) bool {
	if IsBinaryDatabase(content) {
		return true
	}

	_, err := ParseDump(content, "")

	return err == nil
}

func decodeDatabase(content []byte, sourcePath string) (rrdDomain.Database, error) {
	if IsBinaryDatabase(content) {
		return DecodeBinary(content, sourcePath)
	}

	return decodeXML(content, sourcePath)
}

func decodeXML(content []byte, sourcePath string) (rrdDomain.Database, error) {
	var parsed xmlDump
	if err := xml.Unmarshal(content, &parsed); err != nil {
		return rrdDomain.Database{}, fmt.Errorf("decode rrd xml for %q: %w: %w", sourcePath, rrdDomain.ErrNotAnRRDDump, err)
	}

	if !isWithinHeaderBounds(parsed) {
		return rrdDomain.Database{}, fmt.Errorf("%q: %w", sourcePath, rrdDomain.ErrNotAnRRDDump)
	}

	sources := make([]rrdDomain.DataSource, 0, len(parsed.DataSources))
	for _, source := range parsed.DataSources {
		sources = append(sources, rrdDomain.DataSource{
			Name:    strings.TrimSpace(source.Name),
			Type:    strings.TrimSpace(source.Type),
			Maximum: parseValue(source.Maximum),
		})
	}

	archives := make([]rrdDomain.Archive, 0, len(parsed.Archives))
	for _, archive := range parsed.Archives {
		archives = append(archives, rrdDomain.Archive{
			Function:            strings.TrimSpace(archive.Function),
			PrimaryPointsPerRow: archive.PrimaryPointsPerRow,
			RowCount:            len(archive.Rows),
			Values:              valuesOf(archive.Rows, len(sources)),
		})
	}

	return rrdDomain.Database{
		StepSeconds:       parsed.StepSeconds,
		LastUpdateSeconds: parsed.LastUpdateSeconds,
		DataSources:       sources,
		Archives:          archives,
	}, nil
}

// isWithinHeaderBounds holds a dump to the ceilings the binary reader holds a database to, and for
// the same reason: the header is text anyone can write, and a step or a last update taken at its
// word overflows the arithmetic that turns rows into instants. A step or a points-per-row that is
// not positive is left to the checks that already answer for them, since an archive rrdtool could
// not have written is skipped rather than failing the file.
//
// The counts the binary reader also bounds are not bounded here. There they size an allocation
// before a single row is read; here every row is already text in the file, so a dump cannot claim
// more than it holds, and a database too large to read in place still arrives through rrdtool.
func isWithinHeaderBounds(parsed xmlDump) bool {
	if parsed.StepSeconds > maximumSeconds || parsed.LastUpdateSeconds < 0 || parsed.LastUpdateSeconds > maximumInstant {
		return false
	}

	for _, archive := range parsed.Archives {
		if archive.PrimaryPointsPerRow > maximumSeconds {
			return false
		}
	}

	return true
}

func valuesOf(rows []xmlRow, width int) []float64 {
	values := make([]float64, len(rows)*width)
	for rowIndex, row := range rows {
		for column := range width {
			if column < len(row.Values) {
				values[rowIndex*width+column] = parseValue(row.Values[column])

				continue
			}

			values[rowIndex*width+column] = math.NaN()
		}
	}

	return values
}

func seriesOf(database rrdDomain.Database, sourcePath string) ([]seriesDomain.Series, error) {
	readable := readableArchives(database)
	if len(readable) == 0 {
		return nil, fmt.Errorf("%q: %w", sourcePath, rrdDomain.ErrEmptyArchive)
	}

	fileName := filepath.Base(sourcePath)
	root := metricname.RootOf(fileName)

	width := len(database.DataSources)
	out := make([]seriesDomain.Series, 0, width)

	for sourceIndex, dataSource := range database.DataSources {
		name := root
		if width > 1 {
			name = root + metricname.Separator + metricname.Sanitize(dataSource.Name)
		}

		dataSourceType := strings.ToUpper(dataSource.Type)
		unit := inferredUnit(name, dataSource.Name, dataSourceType)

		archives := archivesOf(database, readable, sourceIndex)

		out = append(out, seriesDomain.Series{
			File:              fileName,
			Name:              name,
			Label:             metricname.LabelOf(name),
			Unit:              unit,
			DataSource:        dataSource.Name,
			DataSourceType:    dataSourceType,
			StartMilliseconds: earliestStart(archives),
			StepMilliseconds:  finestStep(archives),
			DataSourceMaximum: declaredMaximum(dataSourceType, dataSource.Maximum),
			Archives:          archives,
		})
	}

	return out, nil
}

// declaredMaximum is the ceiling a data source was created with, or nil when it has none: rrdtool
// spells "no maximum" as NaN, and a ceiling of zero or below could never be measured against. A
// COMPUTE data source declares none: the words that hold a ceiling for the others hold its RPN
// expression, which the binary reader would otherwise take for a number.
func declaredMaximum(dataSourceType string, maximum float64) *float64 {
	if dataSourceType == computeSourceType || math.IsNaN(maximum) || math.IsInf(maximum, 0) || maximum <= 0 {
		return nil
	}

	return &maximum
}

// isRateSourceType says whether rrdtool stores a data source of this type as a rate per second.
// ABSOLUTE belongs with the counters: rrdtool divides it by the interval just as it does a COUNTER.
func isRateSourceType(dataSourceType string) bool {
	switch dataSourceType {
	case "COUNTER", "DERIVE", "DCOUNTER", "DDERIVE", "ABSOLUTE":
		return true
	default:
		return false
	}
}

// readableArchives drops what the charts cannot plot: an archive with no rows, and one named by a
// consolidation this application does not know, which is how Holt-Winters prediction bands and
// their failure flags arrive in a file that also holds ordinary averages.
func readableArchives(database rrdDomain.Database) []rrdDomain.Archive {
	readable := make([]rrdDomain.Archive, 0, len(database.Archives))
	for _, archive := range database.Archives {
		if archive.RowCount == 0 || archive.PrimaryPointsPerRow <= 0 {
			continue
		}

		if _, known := seriesDomain.KnownConsolidationFunction(archive.Function); !known {
			continue
		}

		readable = append(readable, archive)
	}

	return readable
}

func archivesOf(database rrdDomain.Database, readable []rrdDomain.Archive, sourceIndex int) []seriesDomain.Archive {
	width := len(database.DataSources)
	archives := make([]seriesDomain.Archive, 0, len(readable))

	for _, archive := range readable {
		stepSeconds := database.StepSeconds * archive.PrimaryPointsPerRow
		lastEndSeconds := timeunit.StartOfStep(database.LastUpdateSeconds, stepSeconds)
		firstEndSeconds := lastEndSeconds - int64(archive.RowCount-1)*stepSeconds

		samples := make([]seriesDomain.Sample, archive.RowCount)
		for row := range archive.RowCount {
			if value := archive.ValueAt(row, sourceIndex, width); !math.IsNaN(value) && !math.IsInf(value, 0) {
				samples[row] = seriesDomain.Known(value)
			}
		}

		function, _ := seriesDomain.KnownConsolidationFunction(archive.Function)

		// rrdtool stamps a row at the end of the interval it consolidates, (end-step, end]. The
		// charts, the export and the insights place a row at an instant and read the rows placed
		// inside a column, so each row is placed at the start of its interval: stamped at its end, the
		// hourly row for 00:00 to 01:00 would be read as 01:00 to 02:00.
		archives = append(archives, seriesDomain.Archive{
			Function:          function,
			StepMilliseconds:  stepSeconds * timeunit.MillisecondsPerSecond,
			StartMilliseconds: (firstEndSeconds - stepSeconds) * timeunit.MillisecondsPerSecond,
			Samples:           samples,
			CoversIntervals:   true,
		})
	}

	return archives
}

func earliestStart(archives []seriesDomain.Archive) int64 {
	return seriesDomain.SmallestOf(archives, func(archive seriesDomain.Archive) int64 { return archive.StartMilliseconds })
}

func finestStep(archives []seriesDomain.Archive) int64 {
	return seriesDomain.SmallestOf(archives, func(archive seriesDomain.Archive) int64 { return archive.StepMilliseconds })
}

func parseValue(raw string) float64 {
	value, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsInf(value, 0) {
		return math.NaN()
	}

	return value
}
