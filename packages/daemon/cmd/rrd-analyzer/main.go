// Command rrd-analyzer is the RRD Analyzer desktop application.
package main

import (
	"fmt"
	"os"

	"github.com/CharlesLB/rrd-analyzer/packages/daemon/cmd/rrd-analyzer/desktop"
)

func main() {
	if err := desktop.Run(frontendAssets); err != nil {
		fmt.Fprintln(os.Stderr, "rrd-analyzer:", err)
		os.Exit(1)
	}
}
