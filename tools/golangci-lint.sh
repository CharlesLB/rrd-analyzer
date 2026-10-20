#!/usr/bin/env bash
#
# Runs golangci-lint at the version this repository is pinned to, installing it first if the
# machine does not already have that exact version.
#
# It exists so a fresh clone can run `pnpm lint` without a separate bootstrap step. The linter is
# a Go binary rather than a pnpm dependency, so nothing in the install graph brings it along, and
# the failure mode without this script is a bare `golangci-lint: command not found` partway
# through a task that looked like it was working.
#
# The version below is the single source of truth: the CI workflow reads it from here with
# --print-version rather than repeating the number, because a pin that lives in two places is a
# pin that eventually disagrees with itself and lints one thing locally and another in CI.
#
# Deliberately does not change directory. golangci-lint resolves both the module and the
# configuration file from the working directory it is invoked in, and callers already run it from
# the right place: package.json scripts from packages/daemon, CI with an explicit working-directory.
set -euo pipefail

readonly VERSION=2.12.2
readonly MODULE=github.com/golangci/golangci-lint/v2/cmd/golangci-lint

if [ "${1:-}" = "--print-version" ]; then
  echo "v$VERSION"
  exit 0
fi

# `golangci-lint --version` prints a sentence, not a bare number:
#   golangci-lint has version 2.12.2 built with go1.25.5 from ...
# Missing binaries make this fail under `set -e`, hence the guard rather than a bare call.
installed_version() {
  if [ -x "$1" ]; then
    "$1" --version 2>/dev/null | sed -n 's/.*has version \([^ ]*\).*/\1/p'
  fi
}

# Everything below shells out to the Go toolchain, and its absence is the one failure worth
# naming: `go env: command not found` from three lines down reads like a broken script rather
# than a machine that has no Go on it.
if ! command -v go > /dev/null 2>&1; then
  echo "golangci-lint needs the Go toolchain, and go is not on PATH: https://go.dev/dl/" >&2
  exit 1
fi

# GOBIN wins when it is set; `go install` honours it over GOPATH/bin, so looking anywhere else
# would check one path and write to another.
gobin="$(go env GOBIN)"
if [ -z "$gobin" ]; then gobin="$(go env GOPATH)/bin"; fi

binary="$gobin/golangci-lint"

# A copy already on PATH at the pinned version is used as-is: someone who installed it through a
# package manager should not have a second one written into their GOPATH behind their back.
if [ "$(installed_version "$binary")" != "$VERSION" ]; then
  if on_path="$(command -v golangci-lint 2>/dev/null)" &&
    [ "$(installed_version "$on_path")" = "$VERSION" ]; then
    binary="$on_path"
  else
    echo "==> installing golangci-lint v$VERSION into $gobin" >&2
    # `go install pkg@version` builds in module-aware mode outside the current module, so this
    # neither reads nor writes app/daemon's go.mod even when invoked from inside it.
    GOFLAGS= go install "$MODULE@v$VERSION"
    binary="$gobin/golangci-lint"
  fi
fi

exec "$binary" "$@"
