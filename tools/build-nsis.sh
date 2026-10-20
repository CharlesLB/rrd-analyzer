#!/usr/bin/env bash
#
# Builds the Windows installer from what GoReleaser has already produced in dist/.
#
# It picks the executable up out of dist/ rather than rebuilding one, so the installer ships the
# same binary the zip does, including its Authenticode signature, which the build's post hook
# has already applied by this point.
#
# makensis runs on Linux, so the Windows half of the release needs no Windows runner:
#
#   apt-get install -y nsis
#
# Usage:  tools/build-nsis.sh <version>
set -euo pipefail

cd "$(dirname "$0")/.."

# A tag is accepted as readily as a bare version; the leading v is dropped either way so the
# installer sits next to the archives under the same name.
readonly raw_version="${1:?usage: build-nsis.sh <version>}"
readonly version="${raw_version#v}"
readonly script=packaging/windows/rrd-analyzer.nsi
readonly output="dist/rrd-analyzer_${version}_windows_amd64_installer.exe"

if ! command -v makensis > /dev/null 2>&1; then
  echo "build-nsis: makensis is not installed, run apt-get install -y nsis" >&2
  exit 1
fi

# NSIS compares four-field numeric versions, so a tag has to be reduced to major.minor.patch.
# Two prereleases of the same patch therefore carry the same VIProductVersion; tagged releases,
# which is what users install, are unaffected.
product_version="${version%%-*}"
product_version="${product_version%%+*}"
if ! printf '%s' "$product_version" | grep -qE '^[0-9]+(\.[0-9]+){0,2}$'; then
  echo "build-nsis: cannot turn version '$raw_version' into a numeric product version" >&2
  exit 1
fi
while [ "$(printf '%s' "$product_version" | tr -cd . | wc -c)" -lt 2 ]; do
  product_version="$product_version.0"
done

# GoReleaser lays each build out under dist/<build-id>_<goos>_<goarch>[_<goamd64>]/, and the
# version suffix on that directory changes between releases. Finding it beats hard-coding it.
source_exe="$(find dist -type f -name rrd-analyzer.exe -print -quit)"
if [ -z "$source_exe" ]; then
  echo "build-nsis: no rrd-analyzer.exe under dist/, so run the windows build first" >&2
  exit 1
fi

makensis -V2 \
  "-DVERSION=$product_version" \
  "-DSOURCE_EXE=$PWD/$source_exe" \
  "-DOUTPUT=$PWD/$output" \
  "$script"

echo "build-nsis: wrote $output" >&2
