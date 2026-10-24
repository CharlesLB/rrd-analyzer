// Command rrd-analyzer-dev serves the application surface over HTTP so the web
// frontend can be developed and screenshotted in a browser, without the native
// window's build dependencies. It is a development tool, never a deploy target.
package main

import (
	"context"
	"fmt"
	"os"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "rrd-analyzer-dev:", err)
		os.Exit(1)
	}
}
