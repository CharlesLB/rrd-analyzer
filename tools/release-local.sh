#!/usr/bin/env bash
#
# Builds every release artefact this machine can produce and assembles them in dist/ the way a
# release workflow's publish job would: the archives, the packages, the Windows installer, and
# one checksums.txt covering all of them.
#
# It exists because GoReleaser OSS has no --dist flag, so every configuration writes to the same
# dist/ and --clean empties it first. Running the configurations one after another therefore
# leaves only the last one standing. This stages each artefact as it is produced and puts them
# all back at the end.
#
# By default it is a dry run: a snapshot, versioned as the next patch with -next, which needs no
# tag and runs on a dirty tree. RELEASE_TAG turns it into the real thing, the build
# tools/publish-release.sh uploads: GoReleaser's validations stay on, so the tree has to be clean
# and the tag has to point at HEAD, and the artefacts carry the tag's version.
#
# Usage:  tools/release-local.sh                       # everything this host can build
#         tools/release-local.sh windows               # one configuration
#         RELEASE_VERSION=v1.2.3 tools/release-local.sh
#         RELEASE_TAG=v1.2.3 tools/release-local.sh    # the tagged build, not a snapshot
set -euo pipefail

cd "$(dirname "$0")/.."

# Kept free of GNU-only spellings so a macOS checkout can run this too: BSD find has no -printf.
# `if` rather than `[ -e … ] && basename`: the loop's status is the last iteration's, and under
# `set -o pipefail` an unmatched final glob would make the whole function fail. Every format here
# is optional, since the .deb and the Arch package only come off a Linux run and the installer needs
# makensis, so any of them can be the one that is missing.
list_artefacts() {
  for artefact in dist/*.tar.gz dist/*.zip dist/*.deb dist/*.pkg.tar.zst dist/*.exe; do
    if [ -e "$artefact" ]; then basename "$artefact"; fi
  done | sort
}

sha256() {
  if command -v sha256sum > /dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

# GoReleaser picks the version itself (the tag, or incpatch plus -next for a snapshot) and writes
# it to dist/metadata.json. The installer has to be named with that same version.
built_version() {
  sed -n 's/.*"version":"\([^"]*\)".*/\1/p' dist/metadata.json | head -1
}

# A function rather than a flag array: an empty array expanded under `set -u` is an error in the
# bash 3.2 macOS still ships.
run_goreleaser() {
  if [ -n "${RELEASE_TAG:-}" ]; then
    goreleaser release --clean --skip=publish "$@"
  else
    goreleaser release --snapshot --clean --skip=publish "$@"
  fi
}

# The Linux window is WebKitGTK reached through cgo, so those halves need the development
# headers on the host. Checking here turns a linker error three minutes in into one line now.
has_native_webview() {
  command -v pkg-config > /dev/null 2>&1 &&
    pkg-config --exists gtk+-3.0 &&
    pkg-config --exists webkit2gtk-4.1
}

host_target="$(go env GOOS)$(go env GOARCH)"
requested=("$@")
buildable=()
skipped=()

for config in linux-amd64 linux-arm64 windows; do
  # Windows is the odd one out: Wails reaches WebView2 through a pure-Go binding, so it
  # cross-compiles from anywhere with no C toolchain and no headers.
  case "$config" in
    linux-amd64) reason=$([ "$host_target" = linuxamd64 ] && { has_native_webview && echo yes || echo "needs the GTK/WebKit headers, see make deps"; } || echo "needs a linux/amd64 host") ;;
    linux-arm64) reason=$([ "$host_target" = linuxarm64 ] && { has_native_webview && echo yes || echo "needs the GTK/WebKit headers, see make deps"; } || echo "needs a linux/arm64 host") ;;
    windows) reason=yes ;;
  esac

  if [ ${#requested[@]} -gt 0 ]; then
    case " ${requested[*]} " in *" $config "*) ;; *) continue ;; esac
  fi

  if [ "$reason" = yes ]; then buildable+=("$config"); else skipped+=("$config ($reason)"); fi
done

if [ ${#buildable[@]} -eq 0 ]; then
  echo "release-local: nothing to build on this host" >&2
  printf '  %s\n' "${skipped[@]}" >&2
  exit 1
fi

# Pinning the tag matters for RELEASE_TAG as well: with two tags on HEAD, GoReleaser would pick
# one itself.
if [ -n "${RELEASE_TAG:-}" ]; then
  export GORELEASER_CURRENT_TAG="$RELEASE_TAG"
elif [ -n "${RELEASE_VERSION:-}" ]; then
  export GORELEASER_CURRENT_TAG="$RELEASE_VERSION"
fi

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
missing_installer_tool=no

for config in "${buildable[@]}"; do
  echo "==> building $config"
  # Every configuration passes --clean: GoReleaser refuses to start on a dist/ it did not empty
  # itself, and this is the only way to run several of them in a row.
  run_goreleaser --config ".goreleaser.$config.yaml"

  # Two things are lifted out of the Windows run before the next --clean takes them.
  #
  # The installer, because MSI-style packaging is a GoReleaser Pro feature and the OSS pipeline
  # stops at the zip: a missing makensis is reported at the end rather than treated as a failure,
  # since it is one more artefact this host cannot produce, like the platforms it has no runner
  # for. And the bare executable, which ships beside the installer as the portable option, named
  # like every other artefact rather than left in the build directory GoReleaser wrote it to.
  if [ "$config" = windows ]; then
    if command -v makensis > /dev/null 2>&1; then
      ./tools/build-nsis.sh "$(built_version)"
    else
      missing_installer_tool=yes
    fi

    windows_exe="$(find dist -type f -name rrd-analyzer.exe -print -quit)"
    if [ -n "$windows_exe" ]; then
      cp "$windows_exe" "$staging/rrd-analyzer_$(built_version)_windows_amd64.exe"
    fi
  fi

  # Copied out immediately: the next --clean would take it with the rest of dist/.
  for artefact in $(list_artefacts); do cp "dist/$artefact" "$staging/"; done
done

# GoReleaser leaves its own scratch in dist/: the per-build directories, and the json a pipeline
# would hand to its next stage. Only the last configuration's survives the --clean before it, so
# what is left is half a picture. dist/ is what a person publishes, so it ends up holding the
# artefacts and nothing else.
rm -rf dist
mkdir -p dist
find "$staging" -maxdepth 1 -type f -exec cp {} dist/ \;

# One checksums.txt covers everything, written outside dist first and then moved in: a redirect
# into the directory being globbed would create an empty checksums.txt and then checksum it.
artefacts="$(list_artefacts)"
# shellcheck disable=SC2086 # goreleaser's name_template never produces a space
(cd dist && sha256 $artefacts > "$staging/checksums.txt")
mv "$staging/checksums.txt" dist/checksums.txt

echo
echo "built:"
list_artefacts | sed 's/^/  /'
echo "  checksums.txt"

# Never silent about partial coverage: an incomplete dist/ that looks complete is how a release
# ships missing half its platforms.
if [ "$missing_installer_tool" = yes ]; then
  echo
  echo "the windows installer was not built: makensis is not installed (apt install nsis)"
fi

if [ ${#skipped[@]} -gt 0 ]; then
  echo
  echo "not built here:"
  printf '  %s\n' "${skipped[@]}"
fi
