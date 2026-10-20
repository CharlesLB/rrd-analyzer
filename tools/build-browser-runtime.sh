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
# Usage: tools/build-browser-runtime.sh
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAEMON="$REPOSITORY_ROOT/packages/daemon"
OUTPUT="$REPOSITORY_ROOT/packages/ui-analyzer/browser-runtime"

mkdir -p "$OUTPUT"

(cd "$DAEMON" && GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$OUTPUT/rrd-analyzer.wasm" ./cmd/rrd-analyzer-web)

cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$OUTPUT/wasm_exec.js"
cp "$DAEMON/cmd/rrd-analyzer-web/analyzer.worker.js" "$OUTPUT/analyzer.worker.js"

echo "browser runtime written to $OUTPUT"
