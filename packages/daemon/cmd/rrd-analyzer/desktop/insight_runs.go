package desktop

import (
	"context"
	"sync"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/lru"
)

// rememberedEarlyCancels is how many cancels are kept waiting for a run that has not begun. A cancel
// only overtakes its run by the width of one bridge call, so the run it is for begins within a few
// calls or never does; the page aborts one run at a time, and sixty-four is far more than can be in
// that gap at once.
const rememberedEarlyCancels = 64

// insightRuns holds a cancel for every insights run the window is waiting on. A Wails call cannot
// be aborted from the page the way a fetch can, so the page names each run and asks for it to be
// cancelled by that name.
type insightRuns struct {
	mutex   sync.Mutex
	cancels map[string]context.CancelFunc

	// cancelledAhead remembers a run whose cancel arrived before the run itself: the two calls race
	// across the bridge, and a run cancelled first must not then go ahead. A cancel that arrives
	// after its run has already answered looks exactly the same from here and its run never begins,
	// so only the most recent ones are kept: every run is named afresh, and a map of them would grow
	// by one name for each late cancel for as long as the window stays open.
	cancelledAhead *lru.Store[struct{}]
}

func newInsightRuns() *insightRuns {
	return &insightRuns{cancels: map[string]context.CancelFunc{}, cancelledAhead: lru.NewStore[struct{}](rememberedEarlyCancels)}
}

// begin returns the context the run reads under, and the function that lets go of it once the run
// has answered.
func (runs *insightRuns) begin(windowContext context.Context, runID string) (context.Context, func()) {
	runContext, cancel := context.WithCancel(windowContext)

	runs.mutex.Lock()
	defer runs.mutex.Unlock()

	if _, isCancelled := runs.cancelledAhead.Value(runID); isCancelled {
		runs.cancelledAhead.Forget(runID)
		cancel()
	}

	runs.cancels[runID] = cancel

	return runContext, func() {
		runs.mutex.Lock()
		defer runs.mutex.Unlock()

		delete(runs.cancels, runID)
		cancel()
	}
}

func (runs *insightRuns) cancel(runID string) {
	runs.mutex.Lock()
	defer runs.mutex.Unlock()

	if cancel, isRunning := runs.cancels[runID]; isRunning {
		cancel()

		return
	}

	runs.cancelledAhead.Remember(runID, struct{}{})
}
