package desktop

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
)

// oneSourceDump is an rrdtool dump of one series reading 1, 2 and 3 over three five-minute rows.
const oneSourceDump = `<rrd><version>0003</version><step>300</step><lastupdate>900</lastupdate>` +
	`<ds><name>value</name><type>GAUGE</type></ds>` +
	`<rra><cf>AVERAGE</cf><pdp_per_row>1</pdp_per_row><database>` +
	`<row><v>1.0e+00</v></row><row><v>2.0e+00</v></row><row><v>3.0e+00</v></row>` +
	`</database></rra></rrd>`

// windowContextKey marks the context a stand-in window hands its binding, so a test can tell it
// from any other context a dialog might have been given.
type windowContextKey struct{}

const windowContextMark = "the window"

// nativeStandIn stands in for Wails. Its open dialog picks the paths it was given, its save dialog
// points at a file named as suggested inside saveDirectory, or at nothing when that is empty, and
// both fail with dialogErr when it is set. It remembers every dialog it opened, and runs the window
// by handing the options to openWindow.
type nativeStandIn struct {
	picked        []string
	saveDirectory string
	dialogErr     error
	openWindow    func(application *options.App) error

	dialogContexts []context.Context
	openedSources  []runtime.OpenDialogOptions
	openedSaves    []runtime.SaveDialogOptions
}

func (native *nativeStandIn) OpenMultipleFilesDialog(windowContext context.Context, dialogOptions runtime.OpenDialogOptions) ([]string, error) {
	native.dialogContexts = append(native.dialogContexts, windowContext)
	native.openedSources = append(native.openedSources, dialogOptions)

	return native.picked, native.dialogErr
}

func (native *nativeStandIn) SaveFileDialog(windowContext context.Context, dialogOptions runtime.SaveDialogOptions) (string, error) {
	native.dialogContexts = append(native.dialogContexts, windowContext)
	native.openedSaves = append(native.openedSaves, dialogOptions)

	if native.dialogErr != nil || native.saveDirectory == "" {
		return "", native.dialogErr
	}

	return filepath.Join(native.saveDirectory, dialogOptions.DefaultFilename), nil
}

func (native *nativeStandIn) RunWindow(application *options.App) error {
	return native.openWindow(application)
}

func windowContext() context.Context {
	return context.WithValue(context.Background(), windowContextKey{}, windowContextMark)
}

func isWindowContext(callerContext context.Context) bool {
	return callerContext.Value(windowContextKey{}) == windowContextMark
}

// operationsOver is the surface over a library and a search history kept in memory, with sources
// read off disk and the native halves answered through windowDialogs.
func operationsOver(t *testing.T, windowDialogs *dialogs) *surface.Operations {
	t.Helper()

	return surface.Build(surface.Wiring{
		Store:                  analysisInfra.NewMemoryStore(),
		SearchHistory:          searchesInfra.NewMemoryStore(),
		Files:                  surface.DiskSourceFiles(),
		ConfigurationDirectory: t.TempDir(),
		Picker:                 windowDialogs,
		SaveTargets:            windowDialogs,
		Writer:                 exportInfra.NewFileWriter(),
	})
}

// apiOver binds an API to the surface operationsOver builds, its dialogs answered by native.
func apiOver(t *testing.T, native *nativeStandIn) *API {
	t.Helper()

	windowDialogs := newDialogs(native, analysisInfra.NewSourceDescriber())

	return NewAPI(operationsOver(t, windowDialogs), windowDialogs)
}

func writtenDump(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(oneSourceDump), 0o600); err != nil {
		t.Fatalf("write the source: %v", err)
	}

	return path
}
