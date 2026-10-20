// Package usecase is the insights entry point: it validates a request, loads the configuration and
// the catalog, classifies the series, runs the engine and caches the report.
package usecase

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/engine"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/lru"
)

const (
	defaultCacheCapacity = 64
	cacheKeySeparator    = "|"
	seriesIDSeparator    = ","
)

type options struct {
	fineSampleBudget int
	episodeCap       int
	cacheCapacity    int
}

type Option interface {
	apply(*options)
}

type fineSampleBudgetOption int

func (budget fineSampleBudgetOption) apply(settings *options) {
	settings.fineSampleBudget = int(budget)
}

// WithFineSampleBudget sets how many samples an all-data read may hold at the finest step before
// the scan switches to two passes.
func WithFineSampleBudget(samples int) Option { return fineSampleBudgetOption(samples) }

type episodeCapOption int

func (limit episodeCapOption) apply(settings *options) { settings.episodeCap = int(limit) }

// WithEpisodeCap bounds how many episodes one condition keeps for the causal join.
func WithEpisodeCap(episodes int) Option { return episodeCapOption(episodes) }

type cacheCapacityOption int

func (capacity cacheCapacityOption) apply(settings *options) { settings.cacheCapacity = int(capacity) }

// WithCacheCapacity bounds how many reports the service remembers.
func WithCacheCapacity(reports int) Option { return cacheCapacityOption(reports) }

type Service struct {
	source        domain.SeriesSource
	configuration domain.ConfigurationSource
	settings      options

	reports *lru.Cache[domain.Report]
}

func NewService(source domain.SeriesSource, configuration domain.ConfigurationSource, settings ...Option) *Service {
	if source == nil {
		panic("insights service: the series source is not wired")
	}

	if configuration == nil {
		panic("insights service: the configuration source is not wired")
	}

	resolved := options{
		fineSampleBudget: engine.DefaultFineSampleBudget,
		episodeCap:       engine.DefaultEpisodeCap,
		cacheCapacity:    defaultCacheCapacity,
	}

	for _, setting := range settings {
		setting.apply(&resolved)
	}

	return &Service{
		source:        source,
		configuration: configuration,
		settings:      resolved,
		reports:       lru.NewCache[domain.Report](resolved.cacheCapacity),
	}
}

// Run analyses one scope of an analysis. Its result is a pure function of the request, the
// configuration and the files behind the catalog, which is what makes caching it safe: the key
// holds both configuration hashes and the catalog fingerprint, so an edited rule or a rewritten
// file is a different key rather than a stale hit. Two requests for the same key at once share one
// scan. The report is cloned on the way out, so no caller can edit what the next one is handed.
func (service *Service) Run(callerContext context.Context, request domain.Request) (domain.Report, error) {
	if err := validate(request); err != nil {
		return domain.Report{}, err
	}

	configuration, err := service.configuration.Load(callerContext)
	if err != nil {
		return domain.Report{}, fmt.Errorf("load insights configuration: %w", err)
	}

	catalog, err := service.source.Catalog(callerContext, request.AnalysisID)
	if err != nil {
		return domain.Report{}, fmt.Errorf("read catalog of %q: %w", request.AnalysisID, err)
	}

	selected, err := selectSeries(catalog.Series, request.SeriesIDs)
	if err != nil {
		return domain.Report{}, err
	}

	run := scanRun{request: request, window: windowOf(request, catalog), selected: selected, configuration: configuration}
	key := cacheKey(request, run.window, selected, configuration, catalog.Fingerprint)

	report, scanned, err := service.reports.Load(callerContext, key, func(scanContext context.Context) (domain.Report, error) {
		return service.scan(scanContext, run)
	})
	if err != nil {
		return domain.Report{}, err
	}

	answered := cloneReport(report)
	answered.Analyzed.Cached = !scanned

	// The diagnostics are added to every answer rather than kept in the cached report: the key
	// holds the hashes of what was accepted, and a rule that is rejected for another reason, or no
	// longer rejected at all, leaves both unchanged. Cached, the old complaint outlived its fix.
	answered.Analyzed.Warnings = slices.Concat(diagnosticWarnings(configuration.Diagnostics), answered.Analyzed.Warnings)

	return answered, nil
}

// ConfigurationStamp is the configuration the next run would use, read without running anything, so
// the window can tell a report made under rules since edited.
func (service *Service) ConfigurationStamp(callerContext context.Context) (domain.ConfigurationStamp, error) {
	configuration, err := service.configuration.Load(callerContext)
	if err != nil {
		return domain.ConfigurationStamp{}, fmt.Errorf("load insights configuration: %w", err)
	}

	return domain.ConfigurationStamp{RulesetHash: configuration.RulesetHash, ClassifierHash: configuration.ClassifierHash}, nil
}

// scanRun is what one scan is made of once the request is resolved: the window it reads, the series
// it was asked about and the configuration it runs.
type scanRun struct {
	request       domain.Request
	window        engine.Window
	selected      []domain.SeriesInfo
	configuration domain.Configuration
}

func (service *Service) scan(callerContext context.Context, run scanRun) (domain.Report, error) {
	classification := classify.Classify(run.configuration.Classifier, run.selected)

	output, err := engine.Scan(callerContext, service.source, engine.Input{
		AnalysisID:       run.request.AnalysisID,
		Scope:            run.request.Scope,
		Window:           run.window,
		Rules:            run.configuration.Rules,
		Classification:   classification,
		EpisodeCap:       service.settings.episodeCap,
		FineSampleBudget: service.settings.fineSampleBudget,
	})
	if err != nil {
		return domain.Report{}, fmt.Errorf("run insights on %q: %w", run.request.AnalysisID, err)
	}

	return domain.Report{
		Analyzed: domain.Analyzed{
			Scope:              run.request.Scope,
			FromMilliseconds:   run.window.FromMilliseconds,
			UntilMilliseconds:  run.window.UntilMilliseconds,
			RulesetHash:        run.configuration.RulesetHash,
			ClassifierHash:     run.configuration.ClassifierHash,
			SeriesClassified:   len(classification.Classified),
			SeriesUnclassified: references(classification.Unclassified),
			Warnings:           slices.Concat(silentSeriesWarnings(run.selected), output.Warnings),
		},
		Findings: output.Findings,
	}, nil
}

func validate(request domain.Request) error {
	if request.AnalysisID == "" {
		return domain.ErrAnalysisRequired
	}

	switch request.Scope {
	case domain.ScopeAll:
		return nil
	case domain.ScopeViewport:
		if request.UntilMilliseconds <= request.FromMilliseconds {
			return fmt.Errorf("window %d to %d: %w", request.FromMilliseconds, request.UntilMilliseconds, domain.ErrViewportWindowRequired)
		}

		return nil
	default:
		return fmt.Errorf("scope %q: %w", request.Scope, domain.ErrUnknownScope)
	}
}

// selectSeries keeps catalog order whatever order the request listed identifiers in, so two
// requests for the same set are the same run.
func selectSeries(catalog []domain.SeriesInfo, requested []string) ([]domain.SeriesInfo, error) {
	if len(requested) == 0 {
		return catalog, nil
	}

	for _, seriesID := range requested {
		if !slices.ContainsFunc(catalog, func(series domain.SeriesInfo) bool { return series.ID == seriesID }) {
			return nil, fmt.Errorf("series %q: %w", seriesID, domain.ErrUnknownSeries)
		}
	}

	selected := make([]domain.SeriesInfo, 0, len(requested))
	for _, series := range catalog {
		if slices.Contains(requested, series.ID) {
			selected = append(selected, series)
		}
	}

	return selected, nil
}

func windowOf(request domain.Request, catalog domain.Catalog) engine.Window {
	if request.Scope == domain.ScopeViewport {
		return engine.Window{FromMilliseconds: request.FromMilliseconds, UntilMilliseconds: request.UntilMilliseconds}
	}

	return engine.Window{FromMilliseconds: catalog.FromMilliseconds, UntilMilliseconds: catalog.UntilMilliseconds}
}

func cacheKey(request domain.Request, window engine.Window, selected []domain.SeriesInfo, configuration domain.Configuration, fingerprint string) string {
	seriesIDs := make([]string, 0, len(selected))
	for _, series := range selected {
		seriesIDs = append(seriesIDs, series.ID)
	}

	slices.Sort(seriesIDs)

	return strings.Join([]string{
		request.AnalysisID,
		string(request.Scope),
		strconv.FormatInt(window.FromMilliseconds, 10),
		strconv.FormatInt(window.UntilMilliseconds, 10),
		strings.Join(seriesIDs, seriesIDSeparator),
		configuration.RulesetHash,
		configuration.ClassifierHash,
		fingerprint,
	}, cacheKeySeparator)
}

func references(unclassified []domain.SeriesInfo) []domain.SeriesReference {
	listed := make([]domain.SeriesReference, 0, len(unclassified))
	for _, series := range unclassified {
		listed = append(listed, domain.SeriesReference{SeriesID: series.ID, Label: series.Label, DataSource: series.DataSource})
	}

	return listed
}

func diagnosticWarnings(diagnostics []domain.Diagnostic) []string {
	warnings := make([]string, 0, len(diagnostics))

	for _, diagnostic := range diagnostics {
		subject := cmp.Or(diagnostic.RuleID, "configuration")
		warnings = append(warnings, fmt.Sprintf("%s in %s (%s): %s", diagnostic.Title, subject, diagnostic.Origin, diagnostic.Detail))
	}

	return warnings
}

// silentSeriesWarnings names every series whose file was allocated and never written. Its absence
// from the findings says nothing about the host, and whoever reads the report should know that.
func silentSeriesWarnings(selected []domain.SeriesInfo) []string {
	var warnings []string

	for _, series := range selected {
		if series.HasNoReadings {
			warnings = append(warnings, fmt.Sprintf("%s (%s) holds no readings, so nothing in it was analysed", series.File, series.DataSource))
		}
	}

	return warnings
}
