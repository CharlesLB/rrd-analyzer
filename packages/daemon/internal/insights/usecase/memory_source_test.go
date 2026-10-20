package usecase_test

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

var errUnknownTestSeries = errors.New("memory source: unknown series")

// memorySource serves series held in memory the way the analysis layer serves files: a catalog
// spanning the readings, and every read through the range reader the analysis layer uses.
type memorySource struct {
	series      []seriesDomain.Series
	fingerprint string
	reads       atomic.Int64
}

func newMemorySource(series []seriesDomain.Series) *memorySource {
	identified := make([]seriesDomain.Series, len(series))
	for index, parsed := range series {
		if parsed.ID == "" {
			parsed.ID = fmt.Sprintf("f%d", index)
		}

		identified[index] = parsed
	}

	return &memorySource{series: identified, fingerprint: "memory"}
}

func (source *memorySource) Catalog(callerContext context.Context, _ string) (domain.Catalog, error) {
	if err := callerContext.Err(); err != nil {
		return domain.Catalog{}, err
	}

	catalog := domain.Catalog{Fingerprint: source.fingerprint}
	anyReading := false

	for _, series := range source.series {
		finest := series.ArchivesFor(seriesDomain.ConsolidationAverage)[0]
		earliest, hasReading := series.EarliestReadingMilliseconds()
		catalog.Series = append(catalog.Series, domain.SeriesInfo{
			ID: series.ID, File: series.File, Name: series.Name, Label: series.Label, Unit: series.Unit,
			DataSource: series.DataSource, DataSourceType: series.DataSourceType, StepMilliseconds: finest.StepMilliseconds,
			HasNoReadings: !hasReading,
		})

		if hasReading && (!anyReading || earliest < catalog.FromMilliseconds) {
			catalog.FromMilliseconds = earliest
			anyReading = true
		}

		catalog.UntilMilliseconds = max(catalog.UntilMilliseconds, series.UntilMilliseconds())
	}

	return catalog, nil
}

func (source *memorySource) Read(callerContext context.Context, request domain.ReadRequest) (domain.Samples, error) {
	if err := callerContext.Err(); err != nil {
		return domain.Samples{}, err
	}

	source.reads.Add(1)

	for _, series := range source.series {
		if series.ID == request.SeriesID {
			return readSeries(series, request), nil
		}
	}

	return domain.Samples{}, fmt.Errorf("%s: %w", request.SeriesID, errUnknownTestSeries)
}

func readSeries(series seriesDomain.Series, request domain.ReadRequest) domain.Samples {
	read := seriesDomain.ReadRange(series, seriesDomain.RangeRequest{
		FromMilliseconds:  request.FromMilliseconds,
		UntilMilliseconds: request.UntilMilliseconds,
		MaximumSamples:    request.MaximumSamples,
		Function:          seriesDomain.ConsolidationFunction(request.Function),
	})

	return domain.Samples{
		StartMilliseconds:       read.StartMilliseconds,
		StepMilliseconds:        read.StepMilliseconds,
		ArchiveStepMilliseconds: read.ArchiveStepMilliseconds,
		Function:                string(read.Function),
		Values:                  read.ValuesWithHoles(),
	}
}
