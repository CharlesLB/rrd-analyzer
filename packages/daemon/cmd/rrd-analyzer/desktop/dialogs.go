package desktop

import (
	"context"
	"fmt"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
)

type dialogs struct {
	sources surface.SourceDescriber

	windowContext context.Context
}

func newDialogs(sources surface.SourceDescriber) *dialogs {
	if sources == nil {
		panic("desktop dialogs: the source describer is required")
	}

	return &dialogs{sources: sources}
}

func (opener *dialogs) bindTo(windowContext context.Context) {
	opener.windowContext = windowContext
}

func (opener *dialogs) PickSources(callerContext context.Context) ([]surface.FileInfo, error) {
	paths, err := runtime.OpenMultipleFilesDialog(opener.contextOr(callerContext), runtime.OpenDialogOptions{
		Title:   messages.PickSourcesTitle,
		Filters: []runtime.FileFilter{{DisplayName: messages.SourceFilterDisplay, Pattern: messages.SourceFilterPattern}},
	})
	if err != nil {
		return nil, fmt.Errorf("open source dialog: %w", err)
	}

	return opener.sources.Describe(callerContext, paths)
}

func (opener *dialogs) PickSaveTarget(callerContext context.Context, suggestedName string) (string, error) {
	path, err := runtime.SaveFileDialog(opener.contextOr(callerContext), runtime.SaveDialogOptions{
		Title:           messages.SaveExportTitle,
		DefaultFilename: suggestedName,
	})
	if err != nil {
		return "", fmt.Errorf("open save dialog: %w", err)
	}

	return path, nil
}

// contextOr prefers the window's own context: a dialog has to be parented to the window, and the
// caller's context only stands in before OnStartup has handed one over.
func (opener *dialogs) contextOr(callerContext context.Context) context.Context {
	if opener.windowContext != nil {
		return opener.windowContext
	}

	return callerContext
}
