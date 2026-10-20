package engine

import (
	"context"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/domain"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/classify"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/insights/usecase/signal"
)

type Reader interface {
	Read(callerContext context.Context, request domain.ReadRequest) (domain.Samples, error)
}

type Window struct {
	FromMilliseconds  int64
	UntilMilliseconds int64
}

// around is the stretch from before ahead of from to after past until, kept inside the window.
func (window Window) around(from, until, before, after int64) Window {
	return Window{
		FromMilliseconds:  max(window.FromMilliseconds, from-before),
		UntilMilliseconds: min(window.UntilMilliseconds, until+after),
	}
}

type Input struct {
	AnalysisID       string
	Scope            domain.Scope
	Window           Window
	Rules            []domain.Rule
	Classification   classify.Result
	EpisodeCap       int
	FineSampleBudget int
}

type Output struct {
	Findings []domain.Finding
	Warnings []string
}

type Frame struct {
	Series  domain.SeriesInfo
	Samples domain.Samples
}

func (frame Frame) indexOf(instant int64) int {
	return int(signal.RoundHalfUp(float64(instant-frame.Samples.StartMilliseconds) / float64(frame.Samples.StepMilliseconds)))
}

func (frame Frame) instantOf(index int) int64 {
	return frame.Samples.StartMilliseconds + int64(index)*frame.Samples.StepMilliseconds
}

// resolution is the finest interval the frame can place an onset in. History kept only at a coarse
// step and laid out on a finer grid repeats each row, so the archive behind the grid, not the grid,
// bounds what an ordering between two onsets can claim.
func (frame Frame) resolution() int64 {
	return max(frame.Samples.StepMilliseconds, frame.Samples.ArchiveStepMilliseconds)
}
