#!/usr/bin/env bash
#
# Publishes a GitHub release from this machine: the suites, the artefacts, one checksums.txt and
# generated notes, which is what .github/workflows/release.yml does on runners. It exists so a
# release does not have to spend the repository's Actions minutes; the workflow is kept for when
# a runner is the better place to build.
#
# The order is what keeps a bad release from going out. Everything that takes a second is checked
# first (gh, the tag, the tree, the remote), so a mistake surfaces before the suites and the builds
# rather than after them. The suites run next, then the artefacts are built, and only then does
# anything leave this machine: the tag is pushed, and the release is created. gh keeps it a draft
# while the assets upload and publishes it once they are all there, so a failed upload leaves a
# draft rather than a release missing files.
#
# The tag is created on HEAD when it does not exist yet. Until it is pushed it is removed again on
# any failure: a tag that marks no release would be left behind to trip the next attempt, which,
# after a fix, is on a different commit.
#
# linux/arm64 is not built from an amd64 host, because the window is WebKitGTK linked through cgo,
# so a release published from one carries linux/amd64 and Windows. release-local.sh names what it
# skipped. The glibc floor is the host's own: publish from Ubuntu 22.04, the image the workflow
# pins, or the Linux artefacts will refuse to start on anything older than the host.
#
# Usage:  tools/publish-release.sh v1.2.3
#         SKIP_VERIFY=1 tools/publish-release.sh v1.2.3   # the suites already passed on this commit
set -euo pipefail

cd "$(dirname "$0")/.."

readonly tag="${1:?usage: publish-release.sh <tag>, e.g. v1.2.3}"

fail() {
  echo "publish-release: $*" >&2
  exit 1
}

tag_created_here=no

remove_unpushed_tag() {
  if [ "$tag_created_here" = yes ]; then git tag --delete "$tag" > /dev/null; fi
}

trap remove_unpushed_tag EXIT

printf '%s' "$tag" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' || fail "$tag is not a version tag like v1.2.3"

command -v gh > /dev/null 2>&1 || fail "gh is not installed, see https://cli.github.com (brew install gh)"
gh auth status > /dev/null 2>&1 || fail "gh is not signed in, run gh auth login"

# The installer is what most Windows users download, so a release without it is not a partial
# success here the way it is for a dry run.
command -v makensis > /dev/null 2>&1 || fail "makensis is not installed, run sudo apt install nsis"

[ -z "$(git status --porcelain)" ] || fail "the working tree has changes, and a release has to be exactly a commit"

if ! git rev-parse --verify --quiet "refs/tags/$tag" > /dev/null; then
  git tag "$tag"
  tag_created_here=yes
fi

local_tag_object="$(git rev-parse "refs/tags/$tag")"
[ "$(git rev-parse "$tag^{commit}")" = "$(git rev-parse HEAD)" ] || fail "$tag already exists on another commit, run git checkout $tag to publish that one"

# Asked through git rather than gh api, which prints a 404's body on stdout where a sha would be.
# It also proves the git credentials the push at the end needs, before the suites and the builds
# rather than after them. Compared by object, which covers annotated tags too: a tag that was
# moved locally after being pushed would otherwise publish artefacts for one commit under the
# other's notes. An empty answer means GitHub does not have the tag yet, and it is pushed once the
# build is done.
remote_tag_object="$(git ls-remote --tags origin "refs/tags/$tag" | awk -v ref="refs/tags/$tag" '$2 == ref { print $1 }')" || fail "cannot reach origin, check git's GitHub credentials (gh auth setup-git)"
[ -z "$remote_tag_object" ] || [ "$remote_tag_object" = "$local_tag_object" ] || fail "$tag on GitHub is not the local $tag"

if [ -z "${SKIP_VERIFY:-}" ]; then
  pnpm verify
fi

RELEASE_TAG="$tag" tools/release-local.sh

if [ -z "$remote_tag_object" ]; then
  git push origin "refs/tags/$tag"
fi

tag_created_here=no

# Uploading into an existing release is what makes a failed run repeatable: --clobber replaces the
# assets a previous attempt left behind instead of refusing to start.
if gh release view "$tag" > /dev/null 2>&1; then
  gh release upload "$tag" dist/* --clobber
else
  gh release create "$tag" dist/* --verify-tag --title "$tag" --generate-notes
fi

gh release view "$tag" --json url --jq .url
