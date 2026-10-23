#!/usr/bin/env bash
#
# Builds what the browser edition runs in its web worker: the application compiled to WebAssembly,
# the Go runtime glue that loads it, and the worker script that relays the page's messages to it.
# All three go to packages/ui-analyzer/browser-runtime, which the ui-analyzer browser configuration
# copies to browser-runtime/ beside its own files.
#
# wasm_exec.js is copied from the Go toolchain that compiled the module, never kept in the
# repository: the glue and the module have to come from the same Go version, and a copy that drifted
# from the toolchain would fail at load in a way no test here would see.
#
# The module carries the same build identity the desktop build does, into the same package and
# from the same sources as the Makefile: VERSION, COMMIT and COMMIT_DATE when they are set, which is
# how a Docker build names them, and otherwise what git says about the checkout. Without either,
# the app reports "dev", as `go run` does.
#
# Usage: tools/build-browser-runtime.sh
#        VERSION=v1.2.3 COMMIT=<sha> tools/build-browser-runtime.sh
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAEMON="$REPOSITORY_ROOT/packages/daemon"
OUTPUT="$REPOSITORY_ROOT/packages/ui-analyzer/browser-runtime"
VERSION_PACKAGE="github.com/CharlesLB/rrd-analyzer/packages/daemon/internal/shared/version"

VERSION="${VERSION:-$(git -C "$REPOSITORY_ROOT" describe --tags --always --dirty 2> /dev/null || echo dev)}"
COMMIT="${COMMIT:-$(git -C "$REPOSITORY_ROOT" rev-parse HEAD 2> /dev/null || echo none)}"
COMMIT_DATE="${COMMIT_DATE:-$(git -C "$REPOSITORY_ROOT" log -1 --format=%cI 2> /dev/null || echo unknown)}"
LDFLAGS="-s -w -X $VERSION_PACKAGE.Version=${VERSION#v} -X $VERSION_PACKAGE.Commit=$COMMIT -X $VERSION_PACKAGE.Date=$COMMIT_DATE"

mkdir -p "$OUTPUT"

(cd "$DAEMON" && GOOS=js GOARCH=wasm go build -trimpath -ldflags="$LDFLAGS" -o "$OUTPUT/rrd-analyzer.wasm" ./cmd/rrd-analyzer-web)

cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$OUTPUT/wasm_exec.js"
cp "$DAEMON/cmd/rrd-analyzer-web/analyzer.worker.js" "$OUTPUT/analyzer.worker.js"

echo "browser runtime ${VERSION#v} written to $OUTPUT"
