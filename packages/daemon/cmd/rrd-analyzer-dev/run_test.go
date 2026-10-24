package main

import (
	"context"
	"errors"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/sqlitedb"
)

const (
	webAppOrigin = "http://localhost:4200"

	// startupBound and stopBound are how long a test waits for the server to answer, and for run to
	// return once its context ends: far longer than either takes, short enough to fail a hung run.
	startupBound = 10 * time.Second
	stopBound    = shutdownGrace + 5*time.Second
	pollInterval = 20 * time.Millisecond
)

var errCloseRefused = errors.New("the listener refused to close")

// freeAddress is a loopback address no listener holds at the moment it is returned.
func freeAddress(t *testing.T) string {
	t.Helper()

	listener, err := net.Listen(listenNetwork, "127.0.0.1:0")
	if err != nil {
		t.Fatalf("find a free port: %v", err)
	}

	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("free the port: %v", err)
	}

	return address
}

func storePath(t *testing.T) string {
	t.Helper()

	return filepath.Join(t.TempDir(), "development.db")
}

// started runs run in the background, and stops it when the test ends if the test has not.
func started(t *testing.T, arguments []string) (context.CancelFunc, <-chan error) {
	t.Helper()

	lifetime, cancel := context.WithCancel(context.Background())
	finished := make(chan error, 1)

	go func() {
		finished <- run(lifetime, arguments)
	}()

	t.Cleanup(cancel)

	return cancel, finished
}

// answer is what the server said to a request: its status and the origin it allowed.
type answer struct {
	status        int
	allowedOrigin string
}

func answerTo(t *testing.T, method string, url string, origin string) answer {
	t.Helper()

	request, err := http.NewRequestWithContext(context.Background(), method, url, http.NoBody)
	if err != nil {
		t.Fatalf("build the request: %v", err)
	}

	if origin != "" {
		request.Header.Set("Origin", origin)
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	defer func() { _ = response.Body.Close() }()

	return answer{status: response.StatusCode, allowedOrigin: response.Header.Get("Access-Control-Allow-Origin")}
}

// waitUntilServing polls the build route until it answers, and fails the test when run returns
// first or the server never comes up.
func waitUntilServing(t *testing.T, address string, finished <-chan error) {
	t.Helper()

	deadline := time.Now().Add(startupBound)
	for {
		select {
		case err := <-finished:
			t.Fatalf("run returned before serving: %v", err)
		default:
		}

		request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://"+address+"/api/build", http.NoBody)
		if err != nil {
			t.Fatalf("build the request: %v", err)
		}

		if response, err := http.DefaultClient.Do(request); err == nil {
			_ = response.Body.Close()

			return
		}

		if time.Now().After(deadline) {
			t.Fatalf("nothing answered on %s within %s", address, startupBound)
		}

		time.Sleep(pollInterval)
	}
}

func returned(t *testing.T, finished <-chan error) error {
	t.Helper()

	select {
	case err := <-finished:
		return err
	case <-time.After(stopBound):
		t.Fatalf("run was still serving %s after its context ended", stopBound)

		return nil
	}
}

func TestRun_ServesTheDevelopmentSurfaceUntilItsContextEnds(t *testing.T) {
	address := freeAddress(t)
	stop, finished := started(t, []string{"-address", address, "-store", storePath(t), "-web-origin", webAppOrigin})
	waitUntilServing(t, address, finished)

	fromTheWebApp := answerTo(t, http.MethodGet, "http://"+address+"/api/analyses", webAppOrigin)
	fromAnotherPage := answerTo(t, http.MethodGet, "http://"+address+"/api/analyses", "https://example.com")
	reset := answerTo(t, http.MethodPost, "http://"+address+"/api/dev/reset", "")
	stop()

	if fromTheWebApp.status != http.StatusOK || fromTheWebApp.allowedOrigin != webAppOrigin {
		t.Errorf("the web app was answered %d allowing %q, want %d allowing it", fromTheWebApp.status, fromTheWebApp.allowedOrigin, http.StatusOK)
	}

	if fromAnotherPage.status != http.StatusForbidden {
		t.Errorf("another page was answered %d, want %d", fromAnotherPage.status, http.StatusForbidden)
	}

	if reset.status != http.StatusNoContent {
		t.Errorf("the development reset was answered %d, want %d", reset.status, http.StatusNoContent)
	}

	if err := returned(t, finished); err != nil {
		t.Errorf("run = %v, want it to stop cleanly", err)
	}
}

func TestRun_AskedForTheUsage_EndsWithoutServing(t *testing.T) {
	if err := run(context.Background(), []string{"-h"}); err != nil {
		t.Errorf("run = %v, want the usage to be no failure", err)
	}
}

func TestRun_ACommandLineItCannotStartFrom_FailsSayingWhy(t *testing.T) {
	storeDirectory := t.TempDir()

	tests := []struct {
		name          string
		giveArguments []string
		wantMessage   string
	}{
		{name: "no store", giveArguments: []string{"-address", "127.0.0.1:0"}, wantMessage: "-store is required"},
		{name: "a flag it does not know", giveArguments: []string{"-port", "80"}, wantMessage: "read the command line"},
		{name: "a store that is a folder", giveArguments: []string{"-address", "127.0.0.1:0", "-store", storeDirectory}, wantMessage: "open the analysis library"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := run(context.Background(), tt.giveArguments)

			if err == nil || !strings.Contains(err.Error(), tt.wantMessage) {
				t.Errorf("run = %v, want a failure saying %q", err, tt.wantMessage)
			}
		})
	}
}

// TestRun_ALibraryWhoseSchemaHoldsTheSearchHistorysName_FailsOpeningTheSearchHistory gives the
// search history's table name to an index, which SQLite refuses to create a table over even when
// asked to create it only if it is missing.
func TestRun_ALibraryWhoseSchemaHoldsTheSearchHistorysName_FailsOpeningTheSearchHistory(t *testing.T) {
	path := storePath(t)
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

	err = run(context.Background(), []string{"-address", "127.0.0.1:0", "-store", path})

	if err == nil || !strings.Contains(err.Error(), "open the search history") {
		t.Errorf("run = %v, want a failure opening the search history", err)
	}
}

func TestRun_AnAddressAnotherListenerHolds_FailsToListen(t *testing.T) {
	held, err := net.Listen(listenNetwork, "127.0.0.1:0")
	if err != nil {
		t.Fatalf("hold a port: %v", err)
	}
	t.Cleanup(func() { _ = held.Close() })

	err = run(context.Background(), []string{"-address", held.Addr().String(), "-store", storePath(t)})

	if err == nil || !strings.Contains(err.Error(), "listen on "+held.Addr().String()) {
		t.Errorf("run = %v, want a failure to listen on %s", err, held.Addr())
	}
}

func servingServer() *http.Server {
	return &http.Server{
		Handler: http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
			writer.WriteHeader(http.StatusNoContent)
		}),
		ReadTimeout: readTimeout,
	}
}

func TestServeUntilStopped_AListenerThatStopsAccepting_FailsServing(t *testing.T) {
	listener, err := net.Listen(listenNetwork, "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	if err := listener.Close(); err != nil {
		t.Fatalf("close the listener: %v", err)
	}

	err = serveUntilStopped(context.Background(), servingServer(), listener)

	if err == nil || !strings.Contains(err.Error(), "serve on") {
		t.Errorf("serveUntilStopped = %v, want a failure to serve", err)
	}
}

// closeRefusingListener closes the connection it listens on but reports that it could not, the way
// a listener whose descriptor the system failed to release would.
type closeRefusingListener struct {
	net.Listener
}

func (listener closeRefusingListener) Close() error {
	return errors.Join(listener.Listener.Close(), errCloseRefused)
}

func TestServeUntilStopped_AListenerThatCannotBeClosed_FailsShuttingDown(t *testing.T) {
	listener, err := net.Listen(listenNetwork, "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	lifetime, stop := context.WithCancel(context.Background())
	t.Cleanup(stop)

	finished := make(chan error, 1)
	go func() {
		finished <- serveUntilStopped(lifetime, servingServer(), closeRefusingListener{Listener: listener})
	}()

	waitUntilServing(t, listener.Addr().String(), finished)
	stop()

	if err := returned(t, finished); !errors.Is(err, errCloseRefused) {
		t.Errorf("serveUntilStopped = %v, want the failure to close the listener", err)
	}
}
