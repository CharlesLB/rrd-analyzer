#!/usr/bin/env bash
#
# Prints the address the site is served from, such as https://rrd-analyzer.example.com, with no
# trailing slash. Only SITE_URL names it: it is the address search engines index and link previews
# point at, so the canonical link, the social preview image, robots.txt and the sitemap are all
# written with it, and each of them must be absolute.
#
# It fails when SITE_URL is missing or is more than an origin. The site is built with its base at
# /, so it is always served from the root of a host, never from a path below one.
#
# Usage:  SITE_URL=https://rrd-analyzer.example.com tools/site-url.sh
set -euo pipefail

readonly ORIGIN_PATTERN='^https?://[A-Za-z0-9.-]+(:[0-9]+)?$'

site_url="${SITE_URL:-}"
site_url="${site_url%/}"

if [ -z "$site_url" ]; then
  echo "site-url: set SITE_URL to the address the site is served from, like https://rrd-analyzer.example.com" >&2
  exit 1
fi

printf '%s' "$site_url" | grep -qE "$ORIGIN_PATTERN" || {
  echo "site-url: $site_url is not an origin like https://rrd-analyzer.example.com" >&2
  exit 1
}

printf '%s\n' "$site_url"
