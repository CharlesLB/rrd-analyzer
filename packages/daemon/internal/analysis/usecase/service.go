// Package usecase orchestrates the library of analyses and the windows they serve.
package usecase

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"slices"
	"strings"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	seriesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/series/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/lru"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
)

const (
	identifierBytes = 8
	maximumColumns  = 4000
)

// rememberedBundles is how many analyses keep their parsed series in memory. Samples take sixteen
// bytes a row, so a hundred-series analysis holds tens of megabytes; eight covers switching between
// the analyses in use without keeping every analysis ever opened for the life of the process.
const rememberedBundles = 8

type Service struct {
	store     analysisDomain.Store
	loader    analysisDomain.SourceLoader
	clock     analysisDomain.Clock
	unitRules analysisDomain.UnitRules
	presence  analysisDomain.SourcePresence
	bundles   *lru.Cache[parsedSources]
}

// parsedSources is what the service keeps of an analysis it has read: the series, and the files
// they were read from, in order. The files are what lets a later change to the analysis tell
// whether the series it finds here are still the ones that change builds on.
type parsedSources struct {
	bundle seriesDomain.Bundle
	files  []analysisDomain.SourceFile
}

func NewService(store analysisDomain.Store, loader analysisDomain.SourceLoader, clock analysisDomain.Clock, options ...Option) *Service {
	if store == nil || loader == nil || clock == nil {
		panic("analysis service: store, loader and clock are all required")
	}

	service := &Service{
		store:     store,
		loader:    loader,
		clock:     clock,
		unitRules: noUnitRules{},
		presence:  everySourcePresent{},
		bundles:   lru.NewCache[parsedSources](rememberedBundles),
	}

	for _, option := range options {
		option.apply(service)
	}

	return service
}

func (service *Service) List(callerContext context.Context) ([]analysisDomain.Analysis, error) {
	stored, err := service.store.List(callerContext)
	if err != nil {
		return nil, fmt.Errorf("list analyses: %w", err)
	}

	return stored, nil
}

func (service *Service) Create(callerContext context.Context, name string, files []analysisDomain.SourceFile) (analysisDomain.Analysis, error) {
	if len(files) == 0 {
		return analysisDomain.Analysis{}, analysisDomain.ErrNoSources
	}

	now := service.clock.Now()
	analysis := analysisDomain.Analysis{
		ID:           newIdentifier(),
		Name:         resolveName(name, files),
		Files:        files,
		Canvas:       []analysisDomain.CanvasChart{},
		LibraryOrder: []analysisDomain.ChartReference{},
		SeriesColors: []analysisDomain.SeriesColor{},
		CreatedAt:    now,
		LastAccessed: now,
	}

	if err := service.store.Save(callerContext, analysis); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("create analysis: %w", err)
	}

	return analysis, nil
}

// SaveCanvas records the charts an analysis is left with, in order and each with the series merged
// into it, so reopening it restores the canvas and the library can describe it without reading the
// sources again.
func (service *Service) SaveCanvas(callerContext context.Context, analysisID string, canvas []analysisDomain.CanvasChart) error {
	if err := validateCanvas(canvas); err != nil {
		return fmt.Errorf("%q: %w", analysisID, err)
	}

	if err := service.store.SaveCanvas(callerContext, analysisID, cloneCanvas(canvas)); err != nil {
		return fmt.Errorf("record the canvas: %w", err)
	}

	return nil
}

// SaveLibraryOrder records the order a person arranged the chart library in, so reopening the
// analysis lists its series the same way.
func (service *Service) SaveLibraryOrder(callerContext context.Context, analysisID string, order []analysisDomain.ChartReference) error {
	if err := service.store.SaveLibraryOrder(callerContext, analysisID, slices.Clone(order)); err != nil {
		return fmt.Errorf("record the library order: %w", err)
	}

	return nil
}

// SaveSeriesColor records the color a person gave one series, in place of any it was given before, so
// reopening the analysis draws the series in it. The default color, written as an empty color, gives
// the series back the color its position gives it.
//
// The stored colors are compared with the series the sources hold now, which the analysis being open
// keeps in memory, so that a series whose position has moved since it was last recolored is still
// recognised as the same series.
func (service *Service) SaveSeriesColor(callerContext context.Context, analysisID string, color analysisDomain.SeriesColor) error {
	normalised, err := normalisedColor(color.Color)
	if err != nil {
		return fmt.Errorf("%q: %w", color.Color, err)
	}

	color.Color = normalised

	analysis, err := service.find(callerContext, analysisID)
	if err != nil {
		return err
	}

	bundle, err := service.parsedBundle(callerContext, analysisID)
	if err != nil {
		return err
	}

	colors := withSeriesColor(analysis.SeriesColors, color, bundle.Series)
	if err := service.store.SaveSeriesColors(callerContext, analysisID, colors); err != nil {
		return fmt.Errorf("record the series colors: %w", err)
	}

	return nil
}

// SaveSeriesColors replaces every color an analysis gives its series, each normalised the way a
// person's pick is, and the default ones left out. A shared analysis takes its owner's colors this
// way, whole rather than one at a time: the owner may have given a series its default color back,
// and only replacing the list drops it.
func (service *Service) SaveSeriesColors(callerContext context.Context, analysisID string, colors []analysisDomain.SeriesColor) error {
	picked := make([]analysisDomain.SeriesColor, 0, len(colors))
	for _, color := range colors {
		normalised, err := normalisedColor(color.Color)
		if err != nil {
			return fmt.Errorf("%q: %w", color.Color, err)
		}

		if normalised == defaultColor {
			continue
		}

		color.Color = normalised
		picked = append(picked, color)
	}

	if err := service.store.SaveSeriesColors(callerContext, analysisID, picked); err != nil {
		return fmt.Errorf("record the series colors: %w", err)
	}

	return nil
}

// Rename gives an analysis the name a person typed over it, trimmed. A blank name is refused rather
// than replaced by a placeholder: the person cleared it, and only they can say what it should be.
func (service *Service) Rename(callerContext context.Context, analysisID string, name string) (analysisDomain.Analysis, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return analysisDomain.Analysis{}, analysisDomain.ErrNameEmpty
	}

	if err := service.store.Rename(callerContext, analysisID, trimmed); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("rename analysis: %w", err)
	}

	return service.find(callerContext, analysisID)
}

func (service *Service) Delete(callerContext context.Context, analysisID string) error {
	if err := service.store.Delete(callerContext, analysisID); err != nil {
		return fmt.Errorf("delete analysis: %w", err)
	}

	service.bundles.Forget(analysisID)

	return nil
}

// Open is a person opening an analysis: it records the moment, which orders the library, and hands
// back the parsed series with the name, the canvas, the chart library's order and the series colors
// taken from the stored analysis, because those change while the series do not.
//
// The moment is recorded only once the sources have been read. An analysis whose file is gone does
// not open, and counting the attempt would move it to the top of the library as the one most
// recently opened.
func (service *Service) Open(callerContext context.Context, analysisID string) (seriesDomain.Bundle, error) {
	analysis, err := service.find(callerContext, analysisID)
	if err != nil {
		return seriesDomain.Bundle{}, err
	}

	bundle, err := service.Bundle(callerContext, analysisID)
	if err != nil {
		return seriesDomain.Bundle{}, err
	}

	if err := service.store.Touch(callerContext, analysisID, service.clock.Now()); err != nil {
		return seriesDomain.Bundle{}, fmt.Errorf("record the opening: %w", err)
	}

	bundle.AnalysisName = analysis.Name
	bundle.Canvas = canvasOf(analysis.Canvas, bundle.Series)
	bundle.Series = libraryOrderOf(analysis.LibraryOrder, coloredSeries(analysis.SeriesColors, bundle.Series))

	return bundle, nil
}

// Bundle is an analysis' parsed series. The sources are read once, however many callers ask and
// however many ask at the same time, and reading never records an opening: charts, exports and
// insights read an analysis without the library reordering itself around them. The configured units
// are laid over the parsed ones on every read, so an edit to them shows on the next one.
func (service *Service) Bundle(callerContext context.Context, analysisID string) (seriesDomain.Bundle, error) {
	bundle, err := service.parsedBundle(callerContext, analysisID)
	if err != nil {
		return seriesDomain.Bundle{}, err
	}

	return withConfiguredUnits(bundle, service.unitRules.Load(callerContext)), nil
}

func (service *Service) parsedBundle(callerContext context.Context, analysisID string) (seriesDomain.Bundle, error) {
	parsed, _, err := service.bundles.Load(callerContext, analysisID, func(loadContext context.Context) (parsedSources, error) {
		analysis, err := service.find(loadContext, analysisID)
		if err != nil {
			return parsedSources{}, err
		}

		loaded, err := service.loader.Load(loadContext, analysis.Files)
		if err != nil {
			return parsedSources{}, fmt.Errorf("load sources of %q: %w", analysis.Name, err)
		}

		return parsedSources{bundle: assemble(analysis, loaded), files: analysis.Files}, nil
	})

	return parsed.bundle, err
}

type WindowRequest struct {
	AnalysisID        string   `json:"analysisId"`
	SeriesIDs         []string `json:"seriesIds"`
	FromMilliseconds  int64    `json:"fromMilliseconds"`
	UntilMilliseconds int64    `json:"untilMilliseconds"`
	Columns           int      `json:"columns"`
}

// Windows averages every series into the requested columns. The charts, the statistics and the
// export all read averages; the other consolidations a file keeps are there for the insights
// engine, which chooses its own per condition.
func (service *Service) Windows(callerContext context.Context, request WindowRequest) ([]seriesDomain.Window, error) {
	bundle, err := service.Bundle(callerContext, request.AnalysisID)
	if err != nil {
		return nil, err
	}

	aggregation := seriesDomain.AggregationRequest{
		FromMilliseconds:  request.FromMilliseconds,
		UntilMilliseconds: request.UntilMilliseconds,
		Columns:           clampColumns(request.Columns),
		Function:          seriesDomain.ConsolidationAverage,
	}

	indexed := seriesDomain.IndexByID(bundle.Series)
	wanted := request.SeriesIDs
	if len(wanted) == 0 {
		wanted = idsOf(bundle.Series)
	}

	windows := make([]seriesDomain.Window, 0, len(wanted))
	for _, seriesID := range wanted {
		series, known := indexed[seriesID]
		if !known {
			return nil, fmt.Errorf("%q: %w", seriesID, analysisDomain.ErrSeriesNotFound)
		}

		windows = append(windows, seriesDomain.Window{
			SeriesID: seriesID,
			Samples:  seriesDomain.Aggregate(series, aggregation),
		})
	}

	return windows, nil
}

type SeriesStatistics struct {
	SeriesID   string                  `json:"seriesId"`
	HasData    bool                    `json:"hasData"`
	Statistics seriesDomain.Statistics `json:"statistics"`
}

// Chart is what the canvas draws for a window: each series aggregated into its columns, and the
// statistics of exactly those columns.
type Chart struct {
	Windows    []seriesDomain.Window `json:"windows"`
	Statistics []SeriesStatistics    `json:"statistics"`
}

// Chart aggregates the window once and summarises the same columns the lines are drawn from, so the
// statistics strip can never disagree with the chart above it.
func (service *Service) Chart(callerContext context.Context, request WindowRequest) (Chart, error) {
	windows, err := service.Windows(callerContext, request)
	if err != nil {
		return Chart{}, err
	}

	statistics := make([]SeriesStatistics, 0, len(windows))
	for _, window := range windows {
		summary, hasData := seriesDomain.Summarise(window.Samples)
		statistics = append(statistics, SeriesStatistics{SeriesID: window.SeriesID, HasData: hasData, Statistics: summary})
	}

	return Chart{Windows: windows, Statistics: statistics}, nil
}

func (service *Service) find(callerContext context.Context, analysisID string) (analysisDomain.Analysis, error) {
	analysis, err := service.store.Get(callerContext, analysisID)
	if err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("read analysis: %w", err)
	}

	return analysis, nil
}

func idsOf(series []seriesDomain.Series) []string {
	ids := make([]string, 0, len(series))
	for _, parsed := range series {
		ids = append(ids, parsed.ID)
	}

	return ids
}

// clampColumns keeps a window request inside what the aggregator will actually draw, and never
// a request for zero columns that would divide by nothing.
func clampColumns(columns int) int {
	return min(max(columns, seriesDomain.MinimumColumns), maximumColumns)
}

func resolveName(name string, files []analysisDomain.SourceFile) string {
	trimmed := strings.TrimSpace(name)
	if trimmed != "" {
		return trimmed
	}

	if len(files) == 1 {
		base := files[0].Name
		if stem := strings.TrimSuffix(base, filepath.Ext(base)); stem != "" {
			return stem
		}
	}

	return messages.UntitledAnalysis
}

// newIdentifier is sixteen hex characters of system randomness. Since Go 1.24 crypto/rand.Read
// never returns an error: when the system cannot supply entropy it stops the program itself.
func newIdentifier() string {
	raw := make([]byte, identifierBytes)
	_, _ = rand.Read(raw)

	return hex.EncodeToString(raw)
}

// DeleteAll empties the library. It exists for the development routes, which reset the library
// before every end-to-end test and design-check photograph.
func (service *Service) DeleteAll(callerContext context.Context) error {
	stored, err := service.store.List(callerContext)
	if err != nil {
		return fmt.Errorf("list analyses to delete: %w", err)
	}

	for _, analysis := range stored {
		if err := service.Delete(callerContext, analysis.ID); err != nil {
			return err
		}
	}

	return nil
}

// SeededAnalysis is an analysis asked for in a state real use would take days to reach: a past
// access time and a laid-out canvas. The four fields are one value because they are one request.
type SeededAnalysis struct {
	Name         string
	Files        []analysisDomain.SourceFile
	LastAccessed time.Time
	Canvas       []analysisDomain.CanvasChart
}

// CreateSeeded creates an analysis and then writes the state a normal create cannot reach. It
// exists for the development routes, which put the library into the exact states the end-to-end
// suite and the design check photograph.
func (service *Service) CreateSeeded(callerContext context.Context, seeded SeededAnalysis) (analysisDomain.Analysis, error) {
	created, err := service.Create(callerContext, seeded.Name, seeded.Files)
	if err != nil {
		return analysisDomain.Analysis{}, err
	}

	if err := service.store.Touch(callerContext, created.ID, seeded.LastAccessed); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("backdate analysis: %w", err)
	}

	if err := service.store.SaveCanvas(callerContext, created.ID, cloneCanvas(seeded.Canvas)); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("backdate analysis: %w", err)
	}

	created.LastAccessed = seeded.LastAccessed
	created.Canvas = cloneCanvas(seeded.Canvas)

	return created, nil
}
