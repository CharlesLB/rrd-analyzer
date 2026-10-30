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
	sharingDomain "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/domain"
	sharingInfra "github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/sharing/infrastructure"
)

const (
	programName       = "rrd-analyzer-dev"
	defaultAddress    = "127.0.0.1:34115"
	defaultWebOrigins = "http://localhost:4200,http://127.0.0.1:4200"
	originSeparator   = ","
	listenNetwork     = "tcp"
	readTimeout       = 15 * time.Second
	writeTimeout      = 60 * time.Second
	shutdownGrace     = 5 * time.Second
)

// noLegacyLibrary is the legacy path a development run opens the store with: the pre-database JSON
// library belongs to somebody's real installation, and a scratch database must never offer it.
const noLegacyLibrary = ""

// settings is what the command line asked a run for.
type settings struct {
	address               string
	storePath             string
	webOrigins            []string
	insightsConfiguration string
	shareService          string
}

// run serves until callerContext ends or the process is interrupted. Asking for the usage is not a
// failure: the flags have already printed it, and the run ends there with nothing to report.
func run(callerContext context.Context, arguments []string) error {
	chosen, err := settingsFrom(arguments)
	if errors.Is(err, flag.ErrHelp) {
		return nil
	}

	if err != nil {
		return err
	}

	// The server lives until it is interrupted, and every request inherits that lifetime, so an
	// interrupt reaches the reads still in flight instead of leaving them to run on.
	lifetime, stop := signal.NotifyContext(callerContext, os.Interrupt, syscall.SIGTERM)
	defer stop()

	store, err := analysisInfra.OpenStore(lifetime, chosen.storePath, noLegacyLibrary)
	if err != nil {
		return fmt.Errorf("open the analysis library: %w", err)
	}
	defer func() { _ = store.Close() }()

	searchHistory, err := searchesInfra.OpenStore(lifetime, chosen.storePath)
	if err != nil {
		return fmt.Errorf("open the search history: %w", err)
	}
	defer func() { _ = searchHistory.Close() }()

	liveSessions, err := sharingInfra.OpenStore(lifetime, chosen.storePath)
	if err != nil {
		return fmt.Errorf("open the live sessions: %w", err)
	}
	defer func() { _ = liveSessions.Close() }()

	stores := developmentStores{analyses: store, searchHistory: searchHistory, liveSessions: liveSessions}

	server := &http.Server{
		Addr:         chosen.address,
		Handler:      allowWebOrigins(chosen.webOrigins, developmentRoutes(developmentSurface(stores, chosen))),
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		BaseContext:  func(net.Listener) context.Context { return lifetime },
	}

	// The address is bound before anything is logged, so a port already in use fails without first
	// claiming to listen on it.
	var listenConfig net.ListenConfig

	listener, err := listenConfig.Listen(lifetime, listenNetwork, server.Addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", server.Addr, err)
	}

	return serveUntilStopped(lifetime, server, listener)
}

func settingsFrom(arguments []string) (settings, error) {
	flags := flag.NewFlagSet(programName, flag.ContinueOnError)
	address := flags.String("address", defaultAddress, "host:port to listen on")
	storePath := flags.String("store", "", "path to the analyses database")
	webOrigins := flags.String("web-origin", defaultWebOrigins, "comma-separated origins of the web app allowed to call this server from a browser")
	insightsConfiguration := flags.String("insights-configuration", "", "directory of rules.toml, classifier.toml and units.toml overrides; empty runs the built-in rules and units")
	shareService := flags.String("share-service", "", "address of the share service live sessions are published to, such as http://127.0.0.1:8787; empty shares nothing")

	if err := flags.Parse(arguments); err != nil {
		return settings{}, fmt.Errorf("read the command line: %w", err)
	}

	if *storePath == "" {
		return settings{}, errors.New("-store is required so a development run never touches the real library")
	}

	return settings{
		address:               *address,
		storePath:             *storePath,
		webOrigins:            strings.Split(*webOrigins, originSeparator),
		insightsConfiguration: *insightsConfiguration,
		shareService:          *shareService,
	}, nil
}

// developmentStores is everything a development run keeps in its database file.
type developmentStores struct {
	analyses      analysisDomain.Store
	searchHistory searchesDomain.Store
	liveSessions  sharingDomain.Registry
}

// developmentSurface wires the surface the way the desktop window does, except for the halves only
// a native window can provide and for the sources a browser cannot give a path to, which are
// synthesised.
func developmentSurface(stores developmentStores, chosen settings) *surface.Operations {
	files := surface.DiskSourceFiles()
	files.Loader = surface.NewSampleFallbackLoader(files.Loader)

	return surface.Build(surface.Wiring{
		Store:                  stores.analyses,
		SearchHistory:          stores.searchHistory,
		Files:                  files,
		ConfigurationDirectory: chosen.insightsConfiguration,
		Picker:                 httpsurface.UnavailableDialogs{},
		SaveTargets:            httpsurface.UnavailableDialogs{},
		Writer:                 httpsurface.UnavailableDialogs{},
		Sharing:                surface.SharingWiring{ServiceURL: chosen.shareService, Sessions: stores.liveSessions},
	})
}

// developmentRoutes is the surface every browser gateway calls, plus the routes that put the library
// into an exact state for the end-to-end suite and the design check.
func developmentRoutes(operations *surface.Operations) *http.ServeMux {
	mux := httpsurface.Routes(operations)
	httpsurface.RegisterDevelopmentRoutes(mux, operations)

	return mux
}

// serveUntilStopped serves on listener until the lifetime ends, then gives the requests still open a
// short grace to finish, so run returns normally and its deferred store close always gets to run.
//
// The shutdown runs on a goroutine of its own once the serving ends, whichever way it ends, and is
// always waited for. Serving that stops by itself, on a listener that failed, is shut down the same
// way before its failure is reported, so there is one way out rather than one for each order the
// two can happen in.
func serveUntilStopped(lifetime context.Context, server *http.Server, listener net.Listener) error {
	serving, stopServing := context.WithCancel(lifetime)
	shutDown := make(chan error, 1)

	go func() {
		<-serving.Done()

		graceful, cancel := context.WithTimeout(context.WithoutCancel(serving), shutdownGrace)
		defer cancel()

		shutDown <- server.Shutdown(graceful)
	}()

	log.Println("rrd-analyzer-dev listening on", server.Addr)

	served := server.Serve(listener)
	stopServing()

	if err := <-shutDown; err != nil {
		return fmt.Errorf("shut down the development server: %w", err)
	}

	if !errors.Is(served, http.ErrServerClosed) {
		return fmt.Errorf("serve on %s: %w", server.Addr, served)
	}

	log.Println("rrd-analyzer-dev stopped")

	return nil
}
