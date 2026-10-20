//go:build production

package main

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var embedded embed.FS

// frontendAssets is the built web application, embedded into the binary.
//
// The embed is behind the production tag, the tag Wails' own release build sets, because
// //go:embed cannot tolerate a missing directory: without the guard, `go build ./...` on a
// fresh clone fails before the frontend has ever been built.
var frontendAssets = func() fs.FS {
	served, err := fs.Sub(embedded, "dist")
	if err != nil {
		panic("rrd-analyzer: embedded frontend is missing its dist directory: " + err.Error())
	}

	return served
}()
