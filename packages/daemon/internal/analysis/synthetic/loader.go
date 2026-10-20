// Package synthetic builds the fixture dataset the reference prototype plots: ten series over thirty
// days with the incidents its insights are written around. The development server serves it for
// sources a browser cannot give a path to, and the golden and parity tests read it as their input.
package synthetic

import (
	"context"
	"fmt"
	"strings"
	"time"

	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/metricname"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/timeunit"
)

const (
	syntheticStepMilliseconds = 300000
	syntheticWindowDays       = 30
	syntheticSourceName       = "seed"
	syntheticDataSource       = "value"
	syntheticDataSourceType   = "GAUGE"
)

// Fixed rather than time.Now: the example analyses must render the same numbers on
// every machine and on every run.
var syntheticAnchor = time.Date(2026, time.August, 29, 18, 0, 0, 0, time.UTC)

type Loader struct{}

func NewLoader() *Loader {
	return &Loader{}
}

func syntheticAnchorMilliseconds() int64 {
	step := int64(syntheticStepMilliseconds)

	return syntheticAnchor.UnixMilli() / step * step
}

func (loader *Loader) Load(callerContext context.Context, fileNames []string) ([]seriesDomain.Series, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("build synthetic sources: %w", err)
	}

	roots := rootsFrom(fileNames)
	oneMetricPerFile := len(roots) == len(syntheticDefinitions)
	until := syntheticAnchorMilliseconds()
	from := until - syntheticWindowDays*timeunit.MillisecondsPerDay

	out := make([]seriesDomain.Series, 0, len(syntheticDefinitions))
	for index, definition := range syntheticDefinitions {
		name := definition.name
		file := syntheticSourceName
		if len(roots) > 0 {
			bucket := index * len(roots) / len(syntheticDefinitions)
			file = fileNames[bucket]
			name = renameRoot(definition.name, roots[bucket], oneMetricPerFile)
		}

		out = append(out, seriesDomain.Series{
			File:              file,
			Name:              name,
			Label:             metricname.LabelOf(definition.name),
			Unit:              definition.unit,
			DataSource:        syntheticDataSource,
			DataSourceType:    syntheticDataSourceType,
			StartMilliseconds: from,
			StepMilliseconds:  syntheticStepMilliseconds,
			Archives:          archivesOf(synthesise(definition, from, until), from),
		})
	}

	return out, nil
}

// renameRoot re-homes a metric under the file it came from. One metric per file means
// the file name is the metric name, so it replaces the whole name rather than a segment.
func renameRoot(name, root string, oneMetricPerFile bool) string {
	if oneMetricPerFile {
		return root
	}

	parts := strings.Split(name, metricname.Separator)
	parts[0] = root

	return strings.Join(parts, metricname.Separator)
}

func rootsFrom(fileNames []string) []string {
	roots := make([]string, 0, len(fileNames))
	for _, fileName := range fileNames {
		roots = append(roots, metricname.RootOf(fileName))
	}

	return roots
}
