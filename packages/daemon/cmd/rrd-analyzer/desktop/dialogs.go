package desktop

import (
	"context"
	"fmt"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
)

// nativeDialogs is the open and the save dialog of the system, each parented to the window whose
// context it is given.
type nativeDialogs interface {
	OpenMultipleFilesDialog(windowContext context.Context, dialogOptions runtime.OpenDialogOptions) ([]string, error)
	SaveFileDialog(windowContext context.Context, dialogOptions runtime.SaveDialogOptions) (string, error)
}

type dialogs struct {
	native  nativeDialogs
	sources surface.SourceDescriber

	windowContext context.Context
}

func newDialogs(native nativeDialogs, sources surface.SourceDescriber) *dialogs {
	if native == nil || sources == nil {
		panic("desktop dialogs: the native dialogs and the source describer are both required")
	}

	return &dialogs{native: native, sources: sources}
}

func (opener *dialogs) bindTo(windowContext context.Context) {
	opener.windowContext = windowContext
}

func (opener *dialogs) PickSources(callerContext context.Context) ([]surface.FileInfo, error) {
	paths, err := opener.native.OpenMultipleFilesDialog(opener.contextOr(callerContext), runtime.OpenDialogOptions{
		Title:   messages.PickSourcesTitle,
		Filters: []runtime.FileFilter{{DisplayName: messages.SourceFilterDisplay, Pattern: messages.SourceFilterPattern}},
	})
	if err != nil {
		return nil, fmt.Errorf("open source dialog: %w", err)
	}

	return opener.sources.Describe(callerContext, paths)
}

func (opener *dialogs) PickSaveTarget(callerContext context.Context, suggestedName string) (string, error) {
	path, err := opener.native.SaveFileDialog(opener.contextOr(callerContext), runtime.SaveDialogOptions{
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
