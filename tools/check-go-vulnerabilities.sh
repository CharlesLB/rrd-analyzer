#!/usr/bin/env bash
#
# Checks the daemon against the Go vulnerability database the way a release is built: with the
# standard library of the toolchain go.mod names, for every platform a release ships.
#
# `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` does not do that. It builds the tool with
# the newest patch of whatever Go the tool's own go.mod asks for, and the scan then reads that
# toolchain's standard library rather than the one the binaries are linked against: a daemon built
# with an unsupported Go passed it with no finding while carrying 29 fixed vulnerabilities in
# net/http, crypto/tls and encoding/xml. Here the tool is built and run with the module's
# toolchain, so a newer govulncheck that needs a newer Go fails loudly instead of scanning the wrong
# library.
#
# The platforms each scan their own packages: the window (Linux and Windows) and the browser
# edition (js/wasm) link different parts of the standard library. Linux arm64 builds the same code
# against the same library as amd64, so one Linux scan covers both.
#
# Usage: tools/check-go-vulnerabilities.sh
set -euo pipefail

DAEMON="$(cd "$(dirname "${BASH_SOURCE[0]}")/../packages/daemon" && pwd)"
TOOL="golang.org/x/vuln/cmd/govulncheck@latest"

TARGETS=(
  "linux amd64 ./..."
  "windows amd64 ./cmd/rrd-analyzer/..."
  "js wasm ./cmd/rrd-analyzer-web/..."
)

cd "$DAEMON"

toolchain="$(go env GOVERSION)"
tool_directory="$(mktemp -d)"
trap 'rm -rf "$tool_directory"' EXIT

GOFLAGS= GOTOOLCHAIN="$toolchain" GOBIN="$tool_directory" go install "$TOOL"

for target in "${TARGETS[@]}"; do
  read -r operating_system architecture packages <<< "$target"
  echo "==> govulncheck $packages for $operating_system/$architecture, built with $toolchain" >&2
  GOOS="$operating_system" GOARCH="$architecture" GOTOOLCHAIN="$toolchain" "$tool_directory/govulncheck" "$packages"
done
