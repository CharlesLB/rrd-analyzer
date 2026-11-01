// Package desktop is the composition root of the desktop application: it hands the
// surface the adapters only a native window has and gives the result to the Wails window.
package desktop

import (
	"context"
	_ "embed"
	"fmt"
	"io/fs"
	"runtime"

	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	exportInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/export/infrastructure"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/config"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/shareservice"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
)

// programName is the name GTK reports as the window's class, and it has to be the executable's
// own name: it is what StartupWMClass in packaging/linux/rrd-analyzer.desktop matches on, and
// the match is what lets the desktop show the installed icon instead of a blank placeholder.
const programName = "rrd-analyzer"

// macOSPlatform keeps the system frame on macOS: its inset title bar already lets the page run
// under the native traffic lights, which offer full screen the way a drawn button cannot. On every
// other platform the window is frameless and the page draws minimise, maximise and close itself.
const macOSPlatform = "darwin"

const (
	windowWidth          = 1440
	windowHeight         = 900
	minimumWindowWidth   = 400
	minimumWindowHeight  = 600
	lightBackgroundRed   = 244
	lightBackgroundGreen = 244
	lightBackgroundBlue  = 242
)

// windowIcon is what the taskbar, the dock and the alt-tab switcher draw for a running window.
// GTK will not take the SVG the package installs, so tools/render-appicon.py rasterises the
// same mark into this PNG.
//
//go:embed appicon.png
var windowIcon []byte

// nativeRuntime is everything the desktop binary needs of Wails: the window the application runs
// in, and the dialogs that window opens.
type nativeRuntime interface {
	nativeDialogs
	RunWindow(application *options.App) error
}

// run opens the library where this machine keeps it and runs the window over it, returning once the
// window is closed.
func run(frontendAssets fs.FS, native nativeRuntime) error {
	paths, err := config.Resolve()
	if err != nil {
		return fmt.Errorf("resolve application paths: %w", err)
	}

	store, err := analysisInfra.OpenStore(context.Background(), paths.StoreFile, paths.LegacyStoreFile)
	if err != nil {
		return fmt.Errorf("open the analysis library: %w", err)
	}
	defer func() { _ = store.Close() }()

	searchHistory, err := searchesInfra.OpenStore(context.Background(), paths.StoreFile)
	if err != nil {
		return fmt.Errorf("open the search history: %w", err)
	}
	defer func() { _ = searchHistory.Close() }()

	liveSessions, err := sharingInfra.OpenStore(context.Background(), paths.StoreFile)
	if err != nil {
		return fmt.Errorf("open the live sessions: %w", err)
	}
	defer func() { _ = liveSessions.Close() }()

	dialogs := newDialogs(native, analysisInfra.NewSourceDescriber())
	operations := surface.Build(surface.Wiring{
		Store:                  store,
		SearchHistory:          searchHistory,
		Files:                  surface.DiskSourceFiles(),
		ConfigurationDirectory: paths.ConfigurationDirectory,
		Picker:                 dialogs,
		SaveTargets:            dialogs,
		Writer:                 exportInfra.NewFileWriter(),
		Sharing:                surface.SharingWiring{ServiceURL: shareservice.URL, Sessions: liveSessions},
	})
	binding := NewAPI(operations, dialogs)

	return native.RunWindow(&options.App{
		Title:            messages.ApplicationName,
		Frameless:        runtime.GOOS != macOSPlatform,
		Width:            windowWidth,
		Height:           windowHeight,
		MinWidth:         minimumWindowWidth,
		MinHeight:        minimumWindowHeight,
		AssetServer:      &assetserver.Options{Assets: frontendAssets},
		BackgroundColour: &options.RGBA{R: lightBackgroundRed, G: lightBackgroundGreen, B: lightBackgroundBlue, A: 1},
		OnStartup:        binding.start,
		Bind:             []any{binding},
		ErrorFormatter:   callFailureOf,
		DragAndDrop:      &options.DragAndDrop{EnableFileDrop: true},
		Linux:            &linux.Options{Icon: windowIcon, ProgramName: programName, WindowIsTranslucent: false},
		Mac:              &mac.Options{TitleBar: mac.TitleBarHiddenInset()},
	})
}
