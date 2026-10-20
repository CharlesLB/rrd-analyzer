package infrastructure

import (
	"cmp"
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
)

// MemoryStore keeps the library in memory, which is where the browser edition keeps it: the
// analyses last as long as the tab and are gone once it is closed. It answers the way Store does:
// List puts the analysis opened most recently first, the one created first among those opened at
// the same moment, and every write naming an analysis it does not hold reports
// ErrAnalysisNotFound. What goes in and what comes out are copies, so no caller can change a kept
// analysis behind its back.
type MemoryStore struct {
	mutex        sync.Mutex
	entries      map[string]memoryEntry
	lastSequence int
}

// memoryEntry is a kept analysis and the order it was first saved in, the tie-breaker List uses the
// way the SQLite table uses its rowid.
type memoryEntry struct {
	analysis analysisDomain.Analysis
	sequence int
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{entries: make(map[string]memoryEntry)}
}

func (store *MemoryStore) List(callerContext context.Context) ([]analysisDomain.Analysis, error) {
	if err := callerContext.Err(); err != nil {
		return nil, fmt.Errorf("list analyses: %w", err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	entries := make([]memoryEntry, 0, len(store.entries))
	for _, entry := range store.entries {
		entries = append(entries, entry)
	}

	slices.SortFunc(entries, func(first, second memoryEntry) int {
		return cmp.Or(second.analysis.LastAccessed.Compare(first.analysis.LastAccessed), cmp.Compare(first.sequence, second.sequence))
	})

	listed := make([]analysisDomain.Analysis, 0, len(entries))
	for _, entry := range entries {
		listed = append(listed, cloneAnalysis(entry.analysis))
	}

	return listed, nil
}

func (store *MemoryStore) Get(callerContext context.Context, analysisID string) (analysisDomain.Analysis, error) {
	if err := callerContext.Err(); err != nil {
		return analysisDomain.Analysis{}, fmt.Errorf("get analysis %q: %w", analysisID, err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	entry, found := store.entries[analysisID]
	if !found {
		return analysisDomain.Analysis{}, fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
	}

	return cloneAnalysis(entry.analysis), nil
}

// Save writes the whole analysis, keeping the creation time of one already held, as the SQLite
// upsert does.
func (store *MemoryStore) Save(callerContext context.Context, analysis analysisDomain.Analysis) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("save analysis %q: %w", analysis.ID, err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	saved := cloneAnalysis(analysis)

	if existing, found := store.entries[analysis.ID]; found {
		saved.CreatedAt = existing.analysis.CreatedAt
		store.entries[analysis.ID] = memoryEntry{analysis: saved, sequence: existing.sequence}

		return nil
	}

	store.lastSequence++
	store.entries[analysis.ID] = memoryEntry{analysis: saved, sequence: store.lastSequence}

	return nil
}

func (store *MemoryStore) Touch(callerContext context.Context, analysisID string, accessed time.Time) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) {
		analysis.LastAccessed = accessed
	})
}

func (store *MemoryStore) Rename(callerContext context.Context, analysisID string, name string) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) {
		analysis.Name = name
	})
}

func (store *MemoryStore) SaveCanvas(callerContext context.Context, analysisID string, canvas []analysisDomain.CanvasChart) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) {
		analysis.Canvas = cloneCanvas(canvas)
	})
}

func (store *MemoryStore) SaveLibraryOrder(callerContext context.Context, analysisID string, order []analysisDomain.ChartReference) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) {
		analysis.LibraryOrder = slices.Clone(order)
	})
}

func (store *MemoryStore) SaveSeriesColors(callerContext context.Context, analysisID string, colors []analysisDomain.SeriesColor) error {
	return store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) {
		analysis.SeriesColors = slices.Clone(colors)
	})
}

func (store *MemoryStore) AddSources(callerContext context.Context, analysisID string, files []analysisDomain.SourceFile) ([]analysisDomain.SourceFile, error) {
	var added []analysisDomain.SourceFile

	err := store.update(callerContext, analysisID, func(analysis *analysisDomain.Analysis) {
		added = analysisDomain.SourcesNotListed(analysis.Files, files)
		analysis.Files = append(slices.Clone(analysis.Files), added...)
	})
	if err != nil {
		return nil, err
	}

	return slices.Clone(added), nil
}

func (store *MemoryStore) Delete(callerContext context.Context, analysisID string) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("delete analysis %q: %w", analysisID, err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	if _, found := store.entries[analysisID]; !found {
		return fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
	}

	delete(store.entries, analysisID)

	return nil
}

// update changes one kept analysis in place, or reports that there is none to change.
func (store *MemoryStore) update(callerContext context.Context, analysisID string, change func(analysis *analysisDomain.Analysis)) error {
	if err := callerContext.Err(); err != nil {
		return fmt.Errorf("update analysis %q: %w", analysisID, err)
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	entry, found := store.entries[analysisID]
	if !found {
		return fmt.Errorf("%q: %w", analysisID, analysisDomain.ErrAnalysisNotFound)
	}

	change(&entry.analysis)
	store.entries[analysisID] = entry

	return nil
}

// cloneAnalysis copies every list of an analysis, an absent one as an empty one, the way the SQLite
// store reads them back.
func cloneAnalysis(analysis analysisDomain.Analysis) analysisDomain.Analysis {
	analysis.Files = slices.Clone(analysis.Files)
	analysis.Canvas = cloneCanvas(analysis.Canvas)
	analysis.LibraryOrder = referencesOrEmpty(slices.Clone(analysis.LibraryOrder))
	analysis.SeriesColors = colorsOrEmpty(slices.Clone(analysis.SeriesColors))

	return analysis
}

func cloneCanvas(canvas []analysisDomain.CanvasChart) []analysisDomain.CanvasChart {
	cloned := make([]analysisDomain.CanvasChart, 0, len(canvas))
	for _, chart := range canvas {
		chart.Merged = slices.Clone(chart.Merged)
		chart.ReferenceLines = slices.Clone(chart.ReferenceLines)
		cloned = append(cloned, chart)
	}

	return chartsOrEmpty(cloned)
}
