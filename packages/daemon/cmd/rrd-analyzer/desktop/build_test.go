package desktop

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/options"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/config"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/messages"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/sqlitedb"
)

var errWindowFailed = errors.New("the window could not be created")

// homeAt points every place the platform keeps a person's files at home, so the library run opens
// is one the test owns.
func homeAt(t *testing.T, home string) {
	t.Helper()

	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("APPDATA", filepath.Join(home, "AppData"))
}

// resolvedAt is where run keeps the library once home is at a folder of the test's own.
func resolvedAt(t *testing.T) config.Paths {
	t.Helper()

	homeAt(t, t.TempDir())

	paths, err := config.Resolve()
	if err != nil {
		t.Fatalf("resolve the paths: %v", err)
	}

	return paths
}

func bindingOf(t *testing.T, application *options.App) *API {
	t.Helper()

	if len(application.Bind) != 1 {
		t.Fatalf("the window binds %d values, want the API alone", len(application.Bind))
	}

	binding, isAPI := application.Bind[0].(*API)
	if !isAPI {
		t.Fatalf("the window binds a %T, want the API", application.Bind[0])
	}

	return binding
}

func TestRun_OpensTheWindowBoundToTheLibraryWhereThisMachineKeepsIt(t *testing.T) {
	paths := resolvedAt(t)
	assets := os.DirFS(t.TempDir())
	source := writtenDump(t, "cpu.xml")
	native := &nativeStandIn{picked: []string{source}}

	var opened *options.App
	native.openWindow = func(application *options.App) error {
		opened = application
		application.OnStartup(windowContext())
		binding := bindingOf(t, application)

		if _, err := binding.SelectRRDFiles(); err != nil {
			return err
		}

		_, err := binding.CreateAnalysis("Capacity", []surface.FileInfo{sourceAt(source)})

		return err
	}

	if err := run(assets, native); err != nil {
		t.Fatalf("run: %v", err)
	}

	store, err := analysisInfra.OpenStore(context.Background(), paths.StoreFile, paths.LegacyStoreFile)
	if err != nil {
		t.Fatalf("reopen the library: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	if listed, err := store.List(context.Background()); err != nil || len(listed) != 1 || listed[0].Name != "Capacity" {
		t.Errorf("the library at %s holds %+v (%v), want the analysis the window created", paths.StoreFile, listed, err)
	}

	if !isWindowContext(native.dialogContexts[0]) {
		t.Error("the open dialog was not parented to the window that started")
	}

	if opened.Title != messages.ApplicationName || opened.AssetServer.Assets != assets || !opened.DragAndDrop.EnableFileDrop {
		t.Errorf("the window opened as %q over %v dropping files %v, want the application over its assets taking drops",
			opened.Title, opened.AssetServer.Assets, opened.DragAndDrop.EnableFileDrop)
	}

	if opened.Frameless != (runtime.GOOS != macOSPlatform) || opened.Linux.ProgramName != programName || len(opened.Linux.Icon) == 0 {
		t.Errorf("frameless %v, program %q with a %d-byte icon; want a frame on macOS only, and GTK told %q with the icon",
			opened.Frameless, opened.Linux.ProgramName, len(opened.Linux.Icon), programName)
	}
}

func TestRun_AWindowThatFailsToOpen_FailsWithItsReason(t *testing.T) {
	resolvedAt(t)
	native := &nativeStandIn{openWindow: func(*options.App) error { return errWindowFailed }}

	if err := run(os.DirFS(t.TempDir()), native); !errors.Is(err, errWindowFailed) {
		t.Fatalf("run = %v, want %v", err, errWindowFailed)
	}
}

// libraryHoldingTheSearchHistorysName gives the search history's table name to an index, which
// SQLite refuses to create a table over even when asked to create it only if it is missing.
func libraryHoldingTheSearchHistorysName(t *testing.T, path string) {
	t.Helper()

	handle, err := sqlitedb.Open(path)
	if err != nil {
		t.Fatalf("open the library: %v", err)
	}

	if _, err := handle.ExecContext(context.Background(), "CREATE TABLE decoy (term TEXT); CREATE INDEX search_history ON decoy (term);"); err != nil {
		t.Fatalf("write the decoy index: %v", err)
	}

	if err := handle.Close(); err != nil {
		t.Fatalf("close the library: %v", err)
	}
}

func TestRun_APlaceItCannotKeepTheLibrary_FailsBeforeOpeningAWindow(t *testing.T) {
	tests := []struct {
		name        string
		givePlace   func(t *testing.T)
		wantMessage string
	}{
		{name: "no home folder", givePlace: func(t *testing.T) { homeAt(t, "") }, wantMessage: "resolve application paths"},
		{name: "a library file that is a folder", givePlace: func(t *testing.T) {
			if err := os.MkdirAll(resolvedAt(t).StoreFile, 0o700); err != nil {
				t.Fatalf("make the folder: %v", err)
			}
		}, wantMessage: "open the analysis library"},
		{name: "a library whose schema holds the search history's name", givePlace: func(t *testing.T) {
			libraryHoldingTheSearchHistorysName(t, resolvedAt(t).StoreFile)
		}, wantMessage: "open the search history"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.givePlace(t)
			opened := false
			native := &nativeStandIn{openWindow: func(*options.App) error {
				opened = true

				return nil
			}}

			err := run(os.DirFS(t.TempDir()), native)

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) || opened {
				t.Errorf("run = %v after opening a window %v, want a failure saying %q and no window", err, opened, tt.wantMessage)
			}
		})
	}
}
