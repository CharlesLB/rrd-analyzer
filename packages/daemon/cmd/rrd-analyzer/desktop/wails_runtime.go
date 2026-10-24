package desktop

import (
	"context"
	"io/fs"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// wailsRuntime is the desktop binary's one way into Wails. Each method forwards to the Wails runtime
// as it is and decides nothing, so everything that does decide something lives where a stand-in
// for this type can test it.
type wailsRuntime struct{}

// Run opens the desktop window over the frontend's assets and returns once it is closed.
func Run(frontendAssets fs.FS) error {
	return run(frontendAssets, wailsRuntime{})
}

func (wailsRuntime) RunWindow(application *options.App) error {
	return wails.Run(application)
}

func (wailsRuntime) OpenMultipleFilesDialog(windowContext context.Context, dialogOptions runtime.OpenDialogOptions) ([]string, error) {
	return runtime.OpenMultipleFilesDialog(windowContext, dialogOptions)
}

func (wailsRuntime) SaveFileDialog(windowContext context.Context, dialogOptions runtime.SaveDialogOptions) (string, error) {
	return runtime.SaveFileDialog(windowContext, dialogOptions)
}
