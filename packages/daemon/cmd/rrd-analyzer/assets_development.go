//go:build !production

package main

import (
	"embed"
	"io/fs"
)

// frontendAssets is empty in a development build: `wails dev` serves the frontend from the
// Angular dev server and never reads these, so nothing has to be built to compile the binary.
var frontendAssets fs.FS = embed.FS{}
