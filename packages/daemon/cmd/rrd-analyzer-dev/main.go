// Command rrd-analyzer-dev serves the application surface over HTTP so the web
// frontend can be developed and screenshotted in a browser, without the native
// window's build dependencies. It is a development tool, never a deploy target.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/httpsurface"
	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/internal/surface"
	analysisDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/domain"
	analysisInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/analysis/infrastructure"
	searchesDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/domain"
	searchesInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/searches/infrastructure"
)

const (
	defaultAddress    = "127.0.0.1:34115"
	defaultWebOrigins = "http://localhost:4200,http://127.0.0.1:4200"
	originSeparator   = ","
	readTimeout       = 15 * time.Second
	writeTimeout      = 60 * time.Second
	shutdownGrace     = 5 * time.Second
)

// noLegacyLibrary is the legacy path a development run opens the store with: the pre-database JSON
// library belongs to somebody's real installation, and a scratch database must never offer it.
const noLegacyLibrary = ""

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "rrd-analyzer-dev:", err)
		os.Exit(1)
	}
}

func run() error {
	address := flag.String("address", defaultAddress, "host:port to listen on")
	storePath := flag.String("store", "", "path to the analyses database")
	webOrigins := flag.String("web-origin", defaultWebOrigins, "comma-separated origins of the web app allowed to call this server from a browser")
	insightsConfiguration := flag.String("insights-configuration", "", "directory of rules.toml, classifier.toml and units.toml overrides; empty runs the built-in rules and units")
	flag.Parse()

	if *storePath == "" {
		return errors.New("-store is required so a development run never touches the real library")
	}

	// The server lives until it is interrupted, and every request inherits that lifetime, so an
	// interrupt reaches the reads still in flight instead of leaving them to run on.
	lifetime, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	store, err := analysisInfra.OpenStore(lifetime, *storePath, noLegacyLibrary)
	if err != nil {
		return fmt.Errorf("open the analysis library: %w", err)
	}
	defer func() { _ = store.Close() }()

	searchHistory, err := searchesInfra.OpenStore(lifetime, *storePath)
	if err != nil {
		return fmt.Errorf("open the search history: %w", err)
	}
	defer func() { _ = searchHistory.Close() }()

	server := &http.Server{
		Addr:         *address,
		Handler:      allowWebOrigins(strings.Split(*webOrigins, originSeparator), developmentRoutes(developmentSurface(store, searchHistory, *insightsConfiguration))),
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		BaseContext:  func(net.Listener) context.Context { return lifetime },
	}

	return serveUntilStopped(lifetime, server)
}

// developmentSurface wires the surface the way the desktop window does, except for the halves only
// a native window can provide and for the sources a browser cannot give a path to, which are
// synthesised.
func developmentSurface(store analysisDomain.Store, searchHistory searchesDomain.Store, configurationDirectory string) *surface.Operations {
	files := surface.DiskSourceFiles()
	files.Loader = surface.NewSampleFallbackLoader(files.Loader)

	return surface.Build(surface.Wiring{
		Store:                  store,
		SearchHistory:          searchHistory,
		Files:                  files,
		ConfigurationDirectory: configurationDirectory,
		Picker:                 httpsurface.UnavailableDialogs{},
		SaveTargets:            httpsurface.UnavailableDialogs{},
		Writer:                 httpsurface.UnavailableDialogs{},
	})
}

// developmentRoutes is the surface every browser gateway calls, plus the routes that put the library
// into an exact state for the end-to-end suite and the design check.
func developmentRoutes(operations *surface.Operations) *http.ServeMux {
	mux := httpsurface.Routes(operations)
	httpsurface.RegisterDevelopmentRoutes(mux, operations)

	return mux
}

// serveUntilStopped serves until the lifetime ends, then gives the requests still open a short
// grace to finish, so run returns normally and its deferred store close always gets to run. The
// address is bound before anything is logged, so a port already in use fails without first
// claiming to listen on it.
func serveUntilStopped(lifetime context.Context, server *http.Server) error {
	var listenConfig net.ListenConfig

	listener, err := listenConfig.Listen(lifetime, "tcp", server.Addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", server.Addr, err)
	}

	served := make(chan error, 1)

	go func() {
		served <- server.Serve(listener)
	}()

	log.Println("rrd-analyzer-dev listening on", server.Addr)

	select {
	case err := <-served:
		return fmt.Errorf("serve on %s: %w", server.Addr, err)
	case <-lifetime.Done():
	}

	graceful, cancel := context.WithTimeout(context.WithoutCancel(lifetime), shutdownGrace)
	defer cancel()

	if err := server.Shutdown(graceful); err != nil {
		return fmt.Errorf("shut down the development server: %w", err)
	}

	if err := <-served; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve on %s: %w", server.Addr, err)
	}

	log.Println("rrd-analyzer-dev stopped")

	return nil
}
