//go:build !(js && wasm)

// Command rrd-analyzer-web only runs as WebAssembly inside a browser; built for any other target it
// says so and stops. The edition itself is the browser package, which is tested natively.
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "rrd-analyzer-web runs only as WebAssembly in a browser: build it with GOOS=js GOARCH=wasm")
	os.Exit(1)
}
