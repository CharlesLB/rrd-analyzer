#!/usr/bin/env bash
#
# Runs the daemon's tests with the race detector and fails unless every statement is covered, the
# entry points below excepted. Coverage is counted across packages (-coverpkg), so a statement a
# handler test reaches in a use case counts for the use case: what matters is that some test runs
# it, not which package the test lives in.
#
# The exclusions are the binaries' entry points and the glue to a runtime a test cannot start: each
# file holds main() or forwards to Wails or syscall/js, and nothing that decides anything. The Wails
# glue is one file because the desktop package reaches Wails only through it, behind an interface
# its tests stand in for. Code that can be tested does not belong here; a file added to this list
# needs that reason, not a deadline.
#
# A run that misses statements lists them as file:line, the place to start writing the test.
#
# Usage: tools/check-go-coverage.sh
set -euo pipefail

DAEMON="$(cd "$(dirname "${BASH_SOURCE[0]}")/../packages/daemon" && pwd)"
MODULE_PREFIX="github.com/CharlesLB/rrd-analyzer/packages/daemon/"

EXCLUDED_FILES=(
  "cmd/rrd-analyzer/main.go"
  "cmd/rrd-analyzer-dev/main.go"
  "cmd/rrd-analyzer-web/main.go"
  "cmd/rrd-analyzer-web/main_unsupported.go"
  "cmd/rrd-analyzer/desktop/wails_runtime.go"
)

profile="$(mktemp)"
trap 'rm -f "$profile"' EXIT

# -count=1, because a cached test binary still reports the blocks of every package as they were when
# it was built: a package that does not import cmd/ keeps its cache when cmd/ changes, and its profile
# then marks lines that no longer exist as never run.
(cd "$DAEMON" && go test -count=1 -race -coverpkg=./... -coverprofile="$profile" ./...)

# Every test binary writes the blocks of every package it was built against, so the same block
# appears once per binary: a block counts as covered when any of them ran it.
tail -n +2 "$profile" | awk -v prefix="$MODULE_PREFIX" -v excluded="$(IFS=,; echo "${EXCLUDED_FILES[*]}")" '
  BEGIN {
    count = split(excluded, files, ",")
    for (index_ = 1; index_ <= count; index_++) skip[files[index_]] = 1
  }
  {
    block = $1
    file = substr(block, 1, index(block, ":") - 1)
    sub(prefix, "", file)
    if (file in skip) next
    statements[block] = $2
    if (!(block in hits) || $3 + 0 > hits[block] + 0) hits[block] = $3
    position = substr(block, index(block, ":") + 1)
    location[block] = file ":" substr(position, 1, index(position, ".") - 1)
  }
  END {
    for (block in statements) {
      total += statements[block]
      if (hits[block] == 0) {
        missed += statements[block]
        print "  " location[block] | "sort -t: -k1,1 -k2,2n"
      }
    }
    close("sort -t: -k1,1 -k2,2n")
    printf "go coverage: %d of %d statements covered (%.2f%%)\n", total - missed, total, total ? 100 * (total - missed) / total : 100
    exit missed > 0
  }
' || {
  echo "go coverage: the statements above are run by no test" >&2
  exit 1
}
