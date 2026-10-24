package usecase_test

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
)

const (
	last24hFrom  = int64(1787940000000)
	last24hUntil = int64(1788026400000)
)

var errInducedFailure = errors.New("service test: induced failure")

type staticConfiguration struct {
	configuration domain.Configuration
	err           error
}

func (source *staticConfiguration) Load(context.Context) (domain.Configuration, error) {
	return source.configuration, source.err
}

type failingSource struct {
	*memorySource

	catalogErr error
	readErr    error
}

func (source failingSource) Catalog(callerContext context.Context, analysisID string) (domain.Catalog, error) {
	if source.catalogErr != nil {
		return domain.Catalog{}, source.catalogErr
	}

	return source.memorySource.Catalog(callerContext, analysisID)
}

func (source failingSource) Read(callerContext context.Context, request domain.ReadRequest) (domain.Samples, error) {
	if source.readErr != nil {
		return domain.Samples{}, source.readErr
	}

	return source.memorySource.Read(callerContext, request)
}

func allRequest() domain.Request {
	return domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeAll}
}

func last24hRequest() domain.Request {
	return domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeViewport, FromMilliseconds: last24hFrom, UntilMilliseconds: last24hUntil}
}

func defaultConfiguration(t testing.TB) domain.Configuration {
	t.Helper()

	configuration, err := infrastructure.NewConfigurationLoader("").Load(context.Background())
	if err != nil {
		t.Fatalf("load default configuration: %v", err)
	}

	return configuration
}

func marshal(t *testing.T, report domain.Report) string {
	t.Helper()

	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("marshal report: %v", err)
	}

	return string(encoded)
}

func run(t *testing.T, service *usecase.Service, request domain.Request) domain.Report {
	t.Helper()

	report, err := service.Run(context.Background(), request)
	if err != nil {
		t.Fatalf("run %+v: %v", request, err)
	}

	return report
}

func TestNewService_MissingPort_PanicsNamingTheWire(t *testing.T) {
	tests := []struct {
		name          string
		source        domain.SeriesSource
		configuration domain.ConfigurationSource
		want          string
	}{
		{name: "series source", configuration: infrastructure.NewConfigurationLoader(""), want: "series source"},
		{name: "configuration source", source: newMemorySource(nil), want: "configuration source"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				recovered := recover()
				if message, isText := recovered.(string); !isText || !strings.Contains(message, tt.want) {
					t.Errorf("panic = %v, want a message naming the %s", recovered, tt.want)
				}
			}()

			usecase.NewService(tt.source, tt.configuration)
		})
	}
}

func TestServiceRun_InvalidRequest_ReturnsItsSentinel(t *testing.T) {
	service := usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader(""))

	tests := []struct {
		name    string
		give    domain.Request
		wantErr error
	}{
		{name: "no analysis", give: domain.Request{Scope: domain.ScopeAll}, wantErr: domain.ErrAnalysisRequired},
		{name: "unknown scope", give: domain.Request{AnalysisID: goldenAnalysisID, Scope: "weekly"}, wantErr: domain.ErrUnknownScope},
		{name: "viewport without a window", give: domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeViewport}, wantErr: domain.ErrViewportWindowRequired},
		{name: "unknown series", give: domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeAll, SeriesIDs: []string{"nope"}}, wantErr: domain.ErrUnknownSeries},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := service.Run(context.Background(), tt.give); !errors.Is(err, tt.wantErr) {
				t.Errorf("Run error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}

func TestServiceRun_PortFailure_IsWrappedWithWhatWasBeingDone(t *testing.T) {
	source := prototypeSource(t)

	tests := []struct {
		name          string
		source        domain.SeriesSource
		configuration domain.ConfigurationSource
		wantContext   string
	}{
		{name: "configuration", source: source, configuration: &staticConfiguration{err: errInducedFailure}, wantContext: "load insights configuration"},
		{name: "catalog", source: failingSource{memorySource: source, catalogErr: errInducedFailure}, configuration: infrastructure.NewConfigurationLoader(""), wantContext: "read catalog"},
		{name: "read", source: failingSource{memorySource: source, readErr: errInducedFailure}, configuration: infrastructure.NewConfigurationLoader(""), wantContext: "run insights"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := usecase.NewService(tt.source, tt.configuration).Run(context.Background(), allRequest())
			if !errors.Is(err, errInducedFailure) || !strings.Contains(err.Error(), tt.wantContext) {
				t.Errorf("Run error = %v, want %q wrapping the failure", err, tt.wantContext)
			}
		})
	}
}

func TestServiceConfigurationStamp_LoadedConfiguration_IsItsTwoHashes(t *testing.T) {
	const (
		rulesetHash    = "ruleset-hash"
		classifierHash = "classifier-hash"
	)

	configuration := &staticConfiguration{configuration: domain.Configuration{RulesetHash: rulesetHash, ClassifierHash: classifierHash}}

	stamp, err := usecase.NewService(newMemorySource(nil), configuration).ConfigurationStamp(context.Background())

	want := domain.ConfigurationStamp{RulesetHash: rulesetHash, ClassifierHash: classifierHash}
	if err != nil || stamp != want {
		t.Errorf("ConfigurationStamp = %+v, %v; want %+v", stamp, err, want)
	}
}

func TestServiceConfigurationStamp_ConfigurationThatDoesNotLoad_IsWrappedWithWhatWasBeingDone(t *testing.T) {
	configuration := &staticConfiguration{err: errInducedFailure}

	_, err := usecase.NewService(newMemorySource(nil), configuration).ConfigurationStamp(context.Background())
	if !errors.Is(err, errInducedFailure) || !strings.Contains(err.Error(), "load insights configuration") {
		t.Errorf("ConfigurationStamp error = %v, want the load failure wrapped with what was being done", err)
	}
}

func TestServiceRun_FullPipelineTwice_IsByteForByteIdentical(t *testing.T) {
	for _, request := range []domain.Request{allRequest(), last24hRequest()} {
		first := run(t, usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader("")), request)
		second := run(t, usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader("")), request)

		if first.Analyzed.Cached || second.Analyzed.Cached {
			t.Fatal("a fresh service reported a cache hit")
		}

		if marshal(t, first) != marshal(t, second) {
			t.Errorf("scope %s: two runs marshalled differently:\n%s\n%s", request.Scope, marshal(t, first), marshal(t, second))
		}
	}
}

func TestServiceRun_RepeatedRequest_IsServedFromCacheWithoutReads(t *testing.T) {
	source := prototypeSource(t)
	service := usecase.NewService(source, infrastructure.NewConfigurationLoader(""))

	first := run(t, service, allRequest())
	original := marshal(t, first)
	readsAfterFirst := source.reads.Load()

	first.Findings[0].Title = "edited by the caller"
	*first.Findings[0].Evidence[0].Spark[0] = -1

	second := run(t, service, allRequest())
	if !second.Analyzed.Cached || source.reads.Load() != readsAfterFirst {
		t.Fatalf("second run cached=%v after %d more reads, want a hit without reads", second.Analyzed.Cached, source.reads.Load()-readsAfterFirst)
	}

	second.Analyzed.Cached = false
	if marshal(t, second) != original {
		t.Error("the cached report differs from the report first returned, or a caller's edit leaked into the cache")
	}
}

func TestServiceRun_CacheKey_MovesWithWindowSeriesFingerprintAndConfiguration(t *testing.T) {
	source := prototypeSource(t)
	configuration := &staticConfiguration{configuration: defaultConfiguration(t)}
	service := usecase.NewService(source, configuration)

	run(t, service, allRequest())

	if report := run(t, service, last24hRequest()); report.Analyzed.Cached {
		t.Error("a different window was served from the all-data entry")
	}

	subset := domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeAll, SeriesIDs: []string{"f5", "f2"}}
	run(t, service, subset)

	subset.SeriesIDs = []string{"f2", "f5"}
	if report := run(t, service, subset); !report.Analyzed.Cached {
		t.Error("the same series set in another order missed the cache")
	}

	source.fingerprint = "a file changed"
	if report := run(t, service, allRequest()); report.Analyzed.Cached {
		t.Error("a changed catalog fingerprint was served from cache")
	}

	configuration.configuration.RulesetHash = "edited"
	if report := run(t, service, allRequest()); report.Analyzed.Cached {
		t.Error("a changed ruleset hash was served from cache")
	}
}

func TestServiceRun_CacheCapacity_EvictsTheOldestReport(t *testing.T) {
	service := usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader(""), usecase.WithCacheCapacity(1))

	run(t, service, allRequest())
	run(t, service, last24hRequest())

	if report := run(t, service, allRequest()); report.Analyzed.Cached {
		t.Error("a report beyond the cache capacity was still cached")
	}

	if report := run(t, service, allRequest()); !report.Analyzed.Cached {
		t.Error("the most recent report was not cached")
	}
}

func TestServiceRun_ConcurrentCallers_ShareOneServiceSafely(t *testing.T) {
	expected := marshal(t, run(t, usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader("")), allRequest()))
	service := usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader(""))

	reports := make([]domain.Report, 8)
	failures := make([]error, len(reports))

	var group sync.WaitGroup

	for index := range reports {
		group.Go(func() {
			reports[index], failures[index] = service.Run(context.Background(), allRequest())
		})
	}

	group.Wait()

	for index, report := range reports {
		if failures[index] != nil {
			t.Fatalf("caller %d: %v", index, failures[index])
		}

		report.Analyzed.Cached = false
		if marshal(t, report) != expected {
			t.Errorf("caller %d received a report that differs from a solo run", index)
		}
	}
}

func TestServiceRun_SeriesSubset_ClassifiesAndReadsOnlyTheRequestedSeries(t *testing.T) {
	report := run(t, usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader("")),
		domain.Request{AnalysisID: goldenAnalysisID, Scope: domain.ScopeAll, SeriesIDs: []string{"f5", "f2"}})

	if report.Analyzed.SeriesClassified != 2 || report.Analyzed.SeriesUnclassified == nil || len(report.Analyzed.SeriesUnclassified) != 0 {
		t.Errorf("analyzed = %+v, want two classified series and an empty unclassified list", report.Analyzed)
	}

	if len(report.Findings) != 1 || len(report.Findings[0].Evidence) != 3 {
		t.Fatalf("findings = %+v, want the outage with heap, memory and gap evidence only", report.Findings)
	}

	for _, evidence := range report.Findings[0].Evidence {
		if evidence.SeriesID != "f5" && evidence.SeriesID != "f2" {
			t.Errorf("evidence from %s, which the request did not include", evidence.SeriesID)
		}
	}
}

func TestServiceRun_SeriesThatNeverStoredAReading_IsNamedInTheWarnings(t *testing.T) {
	source := prototypeSource(t)
	source.series = append(source.series, seriesDomain.Series{
		ID: "silent", File: "host_cores.rrd", DataSource: "value",
		Archives: []seriesDomain.Archive{{
			Function: seriesDomain.ConsolidationAverage, StepMilliseconds: 300000, Samples: []seriesDomain.Sample{seriesDomain.Unknown(), seriesDomain.Unknown()},
		}},
	})

	report := run(t, usecase.NewService(source, &staticConfiguration{configuration: defaultConfiguration(t)}), allRequest())

	want := "host_cores.rrd (value) holds no readings, so nothing in it was analysed"
	if !slices.Contains(report.Analyzed.Warnings, want) {
		t.Errorf("warnings = %q, want one naming host_cores.rrd", report.Analyzed.Warnings)
	}
}

func TestServiceRun_ConfigurationDiagnostics_AreReportedAsWarnings(t *testing.T) {
	configuration := defaultConfiguration(t)
	configuration.Diagnostics = []domain.Diagnostic{
		{Title: "Unknown severity", RuleID: "broken", Origin: "rules.toml", Detail: `severity "urgent" must be critical, warning or info`},
		{Title: "Configuration file is not readable", Origin: "classifier.toml", Detail: "permission denied"},
	}

	report := run(t, usecase.NewService(prototypeSource(t), &staticConfiguration{configuration: configuration}), allRequest())

	want := []string{
		`Unknown severity in broken (rules.toml): severity "urgent" must be critical, warning or info`,
		"Configuration file is not readable in configuration (classifier.toml): permission denied",
	}

	if strings.Join(report.Analyzed.Warnings, "\n") != strings.Join(want, "\n") {
		t.Errorf("warnings = %q, want %q", report.Analyzed.Warnings, want)
	}
}

func TestServiceRun_DiagnosticsChangedUnderTheSameHashes_AreNotServedFromTheCache(t *testing.T) {
	configuration := defaultConfiguration(t)
	configuration.Diagnostics = []domain.Diagnostic{{Title: "Unknown severity", RuleID: "broken", Origin: "rules.toml", Detail: "rejected"}}

	source := &staticConfiguration{configuration: configuration}
	service := usecase.NewService(prototypeSource(t), source)

	if rejected := run(t, service, allRequest()); !slices.Contains(rejected.Analyzed.Warnings, "Unknown severity in broken (rules.toml): rejected") {
		t.Fatalf("warnings = %q, want the rejected rule named", rejected.Analyzed.Warnings)
	}

	source.configuration.Diagnostics = nil

	repaired := run(t, service, allRequest())
	if !repaired.Analyzed.Cached {
		t.Fatal("the second run was not served from the cache, so it proves nothing about it")
	}

	if len(repaired.Analyzed.Warnings) != 0 {
		t.Errorf("warnings = %q, want none: the rule that was rejected no longer is", repaired.Analyzed.Warnings)
	}
}

func TestServiceRun_SmallBudgetAndCap_StillProduceADeterministicReport(t *testing.T) {
	options := []usecase.Option{usecase.WithFineSampleBudget(2000), usecase.WithEpisodeCap(4)}

	first := run(t, usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader(""), options...), allRequest())
	second := run(t, usecase.NewService(prototypeSource(t), infrastructure.NewConfigurationLoader(""), options...), allRequest())

	if len(first.Findings) == 0 || marshal(t, first) != marshal(t, second) {
		t.Errorf("two-pass reports = %d findings, identical %v; want findings and identical reports", len(first.Findings), marshal(t, first) == marshal(t, second))
	}

	if first.Analyzed.FromMilliseconds != 1785434400000 || first.Analyzed.UntilMilliseconds != last24hUntil || first.Analyzed.RulesetHash == "" {
		t.Errorf("analyzed = %+v, want the catalog span and the ruleset hash", first.Analyzed)
	}
}
