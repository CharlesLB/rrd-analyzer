#!/usr/bin/env bash
#
# Prints the version of the release the landing page links its downloads to, without the tag's
# leading v. RELEASE_VERSION wins when it is set, which is how a Docker build names it: the image is
# built from a context with no .git in it. Otherwise it is the latest stable tag reachable from
# HEAD. Pre-release tags (v1.3.0-beta.1) are skipped there, so a beta never becomes what the page
# offers everyone; RELEASE_VERSION can still name one on purpose.
#
# It fails when neither names a release. A page built without one would point every download
# button at a file that does not exist, so the build stops rather than publish it.
#
# Usage:  tools/release-version.sh                       # 1.2.3, from the latest stable tag
#         RELEASE_VERSION=v1.2.3 tools/release-version.sh
set -euo pipefail

readonly STABLE_TAGS='v[0-9]*'
readonly PRE_RELEASE_TAGS='v*-*'
readonly VERSION_PATTERN='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'

tag="${RELEASE_VERSION:-}"

if [ -z "$tag" ]; then
  tag="$(git describe --tags --abbrev=0 --match "$STABLE_TAGS" --exclude "$PRE_RELEASE_TAGS" 2> /dev/null)" || {
    echo "release-version: no release for the downloads to link to; publish one (make publish v1.2.3) or set RELEASE_VERSION=1.2.3" >&2
    exit 1
  }
fi

version="${tag#v}"

printf '%s' "$version" | grep -qE "$VERSION_PATTERN" || {
  echo "release-version: $tag is not a version like 1.2.3" >&2
  exit 1
}

printf '%s\n' "$version"
