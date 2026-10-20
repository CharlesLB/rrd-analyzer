//go:build js && wasm

// Command rrd-analyzer-web is the application compiled to WebAssembly, for the browser edition. It
// runs inside a web worker of the page, keeps everything it is given in that tab's memory, and
// writes nothing anywhere: closing or reloading the tab is the end of every analysis in it.
//
// It publishes one object on the worker's global scope, rrdAnalyzer, and the worker script beside
// this file relays the page's messages to it:
//
//	serve(requestId, method, path, body) -> Promise<{status, body}>
//	cancel(requestId)
//	keep(name, bytes) -> path
//
// A build that cannot start publishes {failure} instead, so the page can say so.
package main

import (
	"context"
	"syscall/js"
	"time"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer-web/browser"
)

const (
	globalName    = "rrdAnalyzer"
	promiseGlobal = "Promise"
)

func main() {
	edition, err := browser.New(context.Background(), time.Now())
	if err != nil {
		js.Global().Set(globalName, js.ValueOf(map[string]any{"failure": err.Error()}))
		select {}
	}

	js.Global().Set(globalName, js.ValueOf(map[string]any{
		"serve":  js.FuncOf(serveFor(edition)),
		"cancel": js.FuncOf(cancelFor(edition)),
		"keep":   js.FuncOf(keepFor(edition)),
	}))

	// The worker calls into the edition for as long as the tab is open, so main never returns.
	select {}
}

// serveFor answers with a promise and runs the call on a goroutine of its own: a function the page
// calls must return before any other Go code can run, and a run of insights takes seconds.
func serveFor(edition *browser.Edition) func(js.Value, []js.Value) any {
	return func(_ js.Value, arguments []js.Value) any {
		call := browser.Call{RequestID: arguments[0].String(), Method: arguments[1].String(), Path: arguments[2].String(), Body: bodyOf(arguments[3])}

		return js.Global().Get(promiseGlobal).New(js.FuncOf(func(_ js.Value, settle []js.Value) any {
			resolve := settle[0]

			go func() {
				answer := edition.Serve(context.Background(), call)
				resolve.Invoke(js.ValueOf(map[string]any{"status": answer.Status, "body": string(answer.Body)}))
			}()

			return nil
		}))
	}
}

func cancelFor(edition *browser.Edition) func(js.Value, []js.Value) any {
	return func(_ js.Value, arguments []js.Value) any {
		edition.Cancel(arguments[0].String())

		return nil
	}
}

func keepFor(edition *browser.Edition) func(js.Value, []js.Value) any {
	return func(_ js.Value, arguments []js.Value) any {
		content := make([]byte, arguments[1].Get("byteLength").Int())
		js.CopyBytesToGo(content, arguments[1])

		return edition.Keep(arguments[0].String(), content)
	}
}

// bodyOf reads the body the page sent, and none when it sent null.
func bodyOf(body js.Value) []byte {
	if body.Type() != js.TypeString {
		return nil
	}

	return []byte(body.String())
}
