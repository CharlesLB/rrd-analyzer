package desktop

import (
	"context"
	"errors"
	"strconv"
	"testing"
)

func TestInsightRunsCancel_ARunUnderWay_EndsItsContext(t *testing.T) {
	runs := newInsightRuns()
	runContext, finish := runs.begin(context.Background(), "r1")
	defer finish()

	runs.cancel("r1")

	if !errors.Is(runContext.Err(), context.Canceled) {
		t.Fatalf("run context err = %v, want %v", runContext.Err(), context.Canceled)
	}
}

func TestInsightRunsCancel_ArrivingBeforeTheRun_StopsItAsItBegins(t *testing.T) {
	runs := newInsightRuns()

	runs.cancel("r1")
	runContext, finish := runs.begin(context.Background(), "r1")
	defer finish()

	if !errors.Is(runContext.Err(), context.Canceled) {
		t.Fatalf("run context err = %v, want %v", runContext.Err(), context.Canceled)
	}
}

func TestInsightRunsCancel_AnotherRun_LeavesThisOneGoing(t *testing.T) {
	runs := newInsightRuns()
	runContext, finish := runs.begin(context.Background(), "r1")
	defer finish()

	runs.cancel("r2")

	if runContext.Err() != nil {
		t.Fatalf("run context err = %v, want it still running", runContext.Err())
	}
}

func TestInsightRunsCancel_ArrivingAfterRunsThatAlreadyAnswered_KeepsOnlyTheMostRecent(t *testing.T) {
	runs := newInsightRuns()

	runs.cancel("oldest")
	for late := range rememberedEarlyCancels {
		runs.cancel("late-" + strconv.Itoa(late))
	}

	forgotten, finishForgotten := runs.begin(context.Background(), "oldest")
	defer finishForgotten()

	if forgotten.Err() != nil {
		t.Errorf("a cancel older than the %d kept still stopped its run: every late cancel is being held for good", rememberedEarlyCancels)
	}

	recent, finishRecent := runs.begin(context.Background(), "late-"+strconv.Itoa(rememberedEarlyCancels-1))
	defer finishRecent()

	if !errors.Is(recent.Err(), context.Canceled) {
		t.Errorf("the most recent early cancel was dropped: run context err = %v, want %v", recent.Err(), context.Canceled)
	}
}
