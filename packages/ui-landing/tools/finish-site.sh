#!/usr/bin/env bash
#
# Turns what Angular prerendered into dist/browser into the files a static host and a crawler look
# for, once the site's address is known:
#
# - the page prerendered at /not-found moves to /404.html, which Cloudflare (not_found_handling
#   "404-page") and nginx (error_page 404) answer every unknown address with, under a 404 status;
# - index.csr.html goes: it is the shell for rendering in the browser, which a site of prerendered
#   pages never serves, and left in place it would be one more address answering with an empty page;
# - robots.txt and sitemap.xml are written with the site's address, since both must name it in full.
#
# The application at /app/ is not in the sitemap and stays crawlable on purpose: it answers with
# X-Robots-Tag: noindex, and a crawler only reads that header on a page robots.txt lets it fetch.
#
# Usage:  tools/finish-site.sh https://rrd-analyzer.example.com
set -euo pipefail

readonly SITE_DIRECTORY='dist/browser'
readonly NOT_FOUND_ROUTE='not-found'

site_url="${1:?usage: tools/finish-site.sh <site url>}"

mv "$SITE_DIRECTORY/$NOT_FOUND_ROUTE/index.html" "$SITE_DIRECTORY/404.html"
rmdir "$SITE_DIRECTORY/$NOT_FOUND_ROUTE"
rm -f "$SITE_DIRECTORY/index.csr.html"

cat > "$SITE_DIRECTORY/robots.txt" << ROBOTS
User-agent: *
Allow: /
Disallow: /api/

Sitemap: $site_url/sitemap.xml
ROBOTS

cat > "$SITE_DIRECTORY/sitemap.xml" << SITEMAP
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>$site_url/</loc>
  </url>
</urlset>
SITEMAP
