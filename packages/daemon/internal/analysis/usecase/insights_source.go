package usecase

import (
	"context"
	"fmt"
	"slices"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	insightsDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/digest"
)

// InsightsSource is the analysis library as the insights engine reads it. It serves the parsed
// series the charts already draw: a second reader of the files could settle on another archive,
// and a finding would then describe data the chart beneath it does not show.
type InsightsSource struct {
	analyses *Service
}

func NewInsightsSource(analyses *Service) *InsightsSource {
	if analyses == nil {
		panic("insights source: the analysis service is not wired")
	}

	return &InsightsSource{analyses: analyses}
}

// Catalog is the analysis' series as the engine sees them, over the same span the charts show, which
// spanOf starts at the oldest reading rather than at the oldest archive.
func (source *InsightsSource) Catalog(callerContext context.Context, analysisID string) (insightsDomain.Catalog, error) {
	bundle, err := source.bundleOf(callerContext, analysisID)
	if err != nil {
		return insightsDomain.Catalog{}, err
	}

	series := make([]insightsDomain.SeriesInfo, 0, len(bundle.Series))
	for _, parsed := range bundle.Series {
		_, hasReading := parsed.EarliestReadingMilliseconds()

		series = append(series, insightsDomain.SeriesInfo{
			ID:                parsed.ID,
			File:              parsed.File,
			Name:              parsed.Name,
			Label:             parsed.Label,
			Unit:              parsed.Unit,
			DataSource:        parsed.DataSource,
			DataSourceType:    parsed.DataSourceType,
			StepMilliseconds:  finestStepOf(parsed),
			DataSourceMaximum: parsed.DataSourceMaximum,
			HasNoReadings:     !hasReading,
		})
	}

	fingerprint, err := fingerprintOf(bundle)
	if err != nil {
		return insightsDomain.Catalog{}, err
	}

	return insightsDomain.Catalog{
		FromMilliseconds:  bundle.FromMilliseconds,
		UntilMilliseconds: bundle.UntilMilliseconds,
		Fingerprint:       fingerprint,
		Series:            series,
	}, nil
}

// Read takes the readings straight from the parsed series. A scan reads every series several times
// over and no reading carries a unit, so the configured units are not laid over the bundle here.
func (source *InsightsSource) Read(callerContext context.Context, request insightsDomain.ReadRequest) (insightsDomain.Samples, error) {
	bundle, err := source.analyses.parsedBundle(callerContext, request.AnalysisID)
	if err != nil {
		return insightsDomain.Samples{}, err
	}

	found := slices.IndexFunc(bundle.Series, func(series seriesDomain.Series) bool { return series.ID == request.SeriesID })
	if found < 0 {
		return insightsDomain.Samples{}, fmt.Errorf("%q: %w", request.SeriesID, analysisDomain.ErrSeriesNotFound)
	}

	read := seriesDomain.ReadRange(bundle.Series[found], seriesDomain.RangeRequest{
		FromMilliseconds:  request.FromMilliseconds,
		UntilMilliseconds: request.UntilMilliseconds,
		MaximumSamples:    request.MaximumSamples,
		Function:          seriesDomain.ParseConsolidationFunction(request.Function),
	})

	return insightsDomain.Samples{
		StartMilliseconds:       read.StartMilliseconds,
		StepMilliseconds:        read.StepMilliseconds,
		ArchiveStepMilliseconds: read.ArchiveStepMilliseconds,
		Function:                string(read.Function),
		Values:                  read.ValuesWithHoles(),
	}, nil
}

// bundleOf reads an analysis without touching when it was last opened: running insights over an
// analysis is not opening it, and the library orders its rows by that moment.
func (source *InsightsSource) bundleOf(callerContext context.Context, analysisID string) (seriesDomain.Bundle, error) {
	return source.analyses.Bundle(callerContext, analysisID)
}

func finestStepOf(series seriesDomain.Series) int64 {
	archives := series.ArchivesFor(seriesDomain.ConsolidationAverage)
	if len(archives) == 0 {
		return series.StepMilliseconds
	}

	return archives[0].StepMilliseconds
}

// seriesIdentity is what identifies one series' data without reading its rows: which file it came
// from, the unit it is read in, the span its archives cover and how many rows they hold.
type seriesIdentity struct {
	ID                string `json:"id"`
	File              string `json:"file"`
	Unit              string `json:"unit"`
	StartMilliseconds int64  `json:"startMilliseconds"`
	UntilMilliseconds int64  `json:"untilMilliseconds"`
	Rows              int    `json:"rows"`
}

type bundleIdentity struct {
	AnalysisID string           `json:"analysisId"`
	Series     []seriesIdentity `json:"series"`
}

// fingerprintOf names the data a report was computed from. Parsed series are kept for as long as
// the analysis is, so which files they came from, the span they cover and the rows they hold
// identify what the engine read, and an analysis re-created over changed files gets a new one. It
// is hashed the way the ruleset and the classifier are, since a cached report is keyed by all three.
func fingerprintOf(bundle seriesDomain.Bundle) (string, error) {
	identity := bundleIdentity{AnalysisID: bundle.AnalysisID, Series: make([]seriesIdentity, 0, len(bundle.Series))}

	for _, series := range bundle.Series {
		rows := 0
		for _, archive := range series.Archives {
			rows += len(archive.Samples)
		}

		identity.Series = append(identity.Series, seriesIdentity{
			ID:                series.ID,
			File:              series.File,
			Unit:              series.Unit,
			StartMilliseconds: series.StartMilliseconds,
			UntilMilliseconds: series.UntilMilliseconds(),
			Rows:              rows,
		})
	}

	fingerprint, err := digest.OfJSON(identity)
	if err != nil {
		return "", fmt.Errorf("fingerprint the series of %q: %w", bundle.AnalysisName, err)
	}

	return fingerprint, nil
}
