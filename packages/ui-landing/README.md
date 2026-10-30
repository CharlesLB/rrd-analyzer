# RRD Analyzer site

The public site, deployed on its own: the landing page at `/`, and the application itself at
`/app/`, running entirely in the visitor's browser. The landing page is an Angular application
prerendered at build time into plain HTML; the app at `/app/` is `packages/ui-analyzer` built for the
browser, with the Go core compiled to WebAssembly. Neither needs a server of its own: the whole
site is a folder of static files.

## What the browser app keeps

Nothing outside the tab, unless the person shares an analysis live. The Go core (RRD parsing,
series, insights, exports) runs in a web worker of the page, the files a person opens are read there
and kept in that worker's memory, and the library lives in the same memory. Closing or reloading the
tab erases all of it, and nothing is sent anywhere until someone asks for a live link: then the
analysis is encrypted in the tab and published to the share service the same Worker runs, and erased
from it one hour after the last activity (see [docs/SHARING.md](../../docs/SHARING.md)). The app says
so in a bar across its top, the landing page says so beside its demo, and both point at the desktop
app for anyone who wants to work offline and keep their analyses. The `site` end-to-end suite checks
that opening a file sends no request at all.

It opens on a sample analysis, so there is something to explore before opening a file: two weeks of a
made-up HTTP API that the core generates in the tab from fixed seeds, as rrdtool dumps kept like any
file a visitor opens, with the service's log already on the timeline. Its incidents are shaped for
four findings, and the `site` suite checks that insights find them (see `docs/DEVELOPMENT.md`).

## Working on it

From the root of the repository:

```bash
pnpm install
pnpm start:landing                              # the landing page alone, http://127.0.0.1:4300
pnpm start:browser                              # the browser app alone, http://127.0.0.1:4210/app/
SITE_URL=http://127.0.0.1:8080 pnpm build:landing   # the whole site in packages/ui-landing/dist/browser
pnpm --filter @rrd-analyzer/ui-landing test        # unit tests, watching
pnpm --filter @rrd-analyzer/ui-landing test:e2e    # Playwright: the landing page, then the built site
```

Building the site needs Go as well as Node: `tools/build-browser-runtime.sh` compiles the core to
WebAssembly, `packages/ui-analyzer` is built with its `browser` configuration, and the result is copied to
`dist/browser/app`. The `site` end-to-end project serves that build with `python3 -m http.server`,
the closest thing to a static host that every machine already has.

The code follows the same rules as `packages/ui-analyzer`: standalone OnPush components, signals, state in
`src/app/stores/<domain>/`, the screen in `src/app/modules/home/`, and every visible word in the
catalogue at `src/app/stores/i18n/models/english-messages/english.messages.ts`.

## The release it links to

Every download link points at one release's assets (`/releases/download/v<version>/...`), so a link
never breaks when a newer release comes out. That version is not written anywhere: the build takes
it from the latest stable tag reachable from HEAD (`tools/release-version.sh`, which skips
pre-releases such as `v1.3.0-beta.1`), or from `RELEASE_VERSION` when it is set. With neither, the
production build stops instead of linking every button to a file that does not exist. The dev
server, the unit tests and the end-to-end suite use `0.0.0`.

The file names mirror the GoReleaser and NSIS templates; if those change,
`release-catalogue.model.ts` changes with them.

What a release still changes by hand is the copy in `english.messages.ts`: the hero pill
(`hero.releaseHeadline`) and the three bullets of `download.releaseNotes`. The repository URL and
the Ko-fi page are in `src/app/core/config/landing.config.ts`.

## Search engines and link previews

The page is prerendered, so a crawler reads all of it without running a script, and it tells search
engines and link previews everything they look for:

- **One address per page.** The landing page links its canonical address, `SITE_URL` followed by
  `/`, so `/?utm_source=…` and every other copy count as the same page. `/index.html`, `/app` and
  `/app/index.html` answer with a permanent `301` to `/` and `/app/` (`public/_redirects` on
  Cloudflare, `nginx/landing.conf` on nginx), never with Cloudflare's default `307`.
- **A real 404.** An address that does not exist answers `404 Not Found` with the not-found page,
  which says so and leads back home, instead of the landing page under a `200`, which a search engine
  reads as a "soft 404" and a copy of the home page.
- **The landing page is the one result.** It is marked `index, follow, max-image-preview:large`; the
  app at `/app/` answers with `X-Robots-Tag: noindex`, since it shows nothing until it runs, and the
  not-found page carries `noindex`. `robots.txt` lets crawlers fetch everything but `/api/`: a
  crawler only reads `noindex` on a page it is allowed to fetch.
- **Link previews.** Open Graph and `twitter:card` tags give a shared link the title, the
  description and the workspace screenshot as a large image.
- **Structured data.** A JSON-LD graph names the site (`WebSite`, which is what Google shows as the
  site name) and describes the application (`SoftwareApplication`: free, versioned, the systems a
  release has a package for). Search Console's report on software apps lists it as missing
  `aggregateRating` or `review`, which only a rich result with stars needs: there are no ratings to
  give it, and inventing them is against Google's guidelines.
- **`robots.txt` and `sitemap.xml`** are written by `tools/finish-site.sh` after the prerender,
  with `SITE_URL`, since both must name the site's address in full.

The page's title and description are in the catalogue (`meta.title`, `meta.description`), and the
tags are built in `src/app/modules/home/models/home-head/` and written by
`src/app/core/document-head/`.

### Once the site is live

These live outside the repository, in the dashboards:

1. **One host.** Pick the host `SITE_URL` names, `rrd-analyzer.example.com` or
   `www.rrd-analyzer.example.com`, and send the other to it with a permanent redirect. On
   Cloudflare that is a Redirect Rule on the zone (*Rules → Redirect Rules*, "Redirect from WWW to
   root" or its reverse, status `301`, preserving the path and the query string): `_redirects`
   only matches paths, never hosts. Turn on *SSL/TLS → Edge Certificates → Always Use HTTPS* so
   `http://` answers with a redirect too.
2. **Google Search Console.** Add the site as a *Domain* property, verified with the DNS record it
   asks for, submit `https://<host>/sitemap.xml` under *Sitemaps*, and ask for the home page to be
   indexed with *URL inspection → Request indexing*. Bing Webmaster Tools imports the property from
   Search Console in one step.
3. **Check it** with Google's Rich Results Test and URL Inspection on the live address, which show
   the canonical Google chose and the structured data it read.

## Deploying

`pnpm build:landing` writes the site to `packages/ui-landing/dist/browser`. Nothing in it needs Node:
serve the folder. The build needs `SITE_URL`, the address the site is served from
(`https://rrd-analyzer.example.com`, an origin with no path), and stops without it
(`tools/site-url.sh`).

### With Docker

The image builds the site and serves it with nginx as an unprivileged user on port 8080. It is built
from the root of the repository, since the lockfile, the web app and the Go core live there, from a
context with no `.git` in it, so the versions and the address come in as build arguments:
`SITE_URL`, the address the site is served from, and `RELEASE_VERSION`, the release the downloads
link to, are required, and `VERSION` and `COMMIT` name the build the app reports. The
`docker:build` script takes `SITE_URL` from the environment and the other three from the checkout:

```bash
SITE_URL=https://rrd-analyzer.example.com pnpm --filter @rrd-analyzer/ui-landing docker:build
pnpm --filter @rrd-analyzer/ui-landing docker:run
```

or, on the server, inside `packages/ui-landing` (the compose file runs the container read-only, with
no capabilities, and refuses to build without `SITE_URL` and `RELEASE_VERSION`):

```bash
SITE_URL=https://rrd-analyzer.example.com RELEASE_VERSION="$(tools/release-version.sh)" VERSION="$(git describe --tags --always --dirty)" \
  COMMIT="$(git rev-parse HEAD)" docker compose up --build -d
```

Put TLS in front of it with whatever already terminates HTTPS on the server.

### On an existing nginx

Copy `dist/browser` to the server and point a server block at it, starting from
`nginx/landing.conf`: it sets the cache headers (hashed bundles cached for a year, pages and the
WebAssembly module revalidated on every visit), gzip, the security headers, the permanent redirects
and the 404 page the section above describes. Its redirects carry the path alone
(`absolute_redirect off`), so behind the proxy that terminates TLS they keep the public host and
`https`. The Content
Security Policy allows no inline script anywhere; `/app/` adds `'wasm-unsafe-eval'` and
`worker-src 'self'`, which compiling the module and starting its worker need. Whatever serves the
site must send `.wasm` files as `application/wasm`.

The app reads its font from `/fonts/`, which the landing page provides at the root of the site:
the two are meant to be deployed together.
