# RRD Analyzer site

The public site, deployed on its own: the landing page at `/`, and the application itself at
`/app/`, running entirely in the visitor's browser. The landing page is an Angular application
prerendered at build time into plain HTML; the app at `/app/` is `packages/ui-analyzer` built for the
browser, with the Go core compiled to WebAssembly. Neither needs a server of its own: the whole
site is a folder of static files.

## What the browser app keeps

Nothing outside the tab. The Go core (RRD parsing, series, insights, exports) runs in a web worker
of the page, the files a person opens are read there and kept in that worker's memory, and the
library lives in the same memory. Closing or reloading the tab erases all of it; nothing is ever
sent anywhere, and the server only answers GET requests for static files. The app says so in a bar
across its top, the landing page says so beside its demo, and both point at the desktop app for
anyone who wants to work offline and keep their analyses. The `site` end-to-end suite checks that
opening a file sends no request at all.

It opens on a sample analysis, the synthetic reference dataset the development server serves, so
there is something to explore before opening a file.

## Working on it

From the root of the repository:

```bash
pnpm install
pnpm start:landing                              # the landing page alone, http://127.0.0.1:4300
pnpm start:browser                              # the browser app alone, http://127.0.0.1:4210/app/
pnpm build:landing                              # the whole site in packages/ui-landing/dist/browser
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

## What to change on a release

Everything that names a release lives in two files:

- `src/app/core/config/landing.config.ts`: `RELEASE_VERSION`. Every download link is built from
  it, pointing at that tag's assets (`/releases/download/v<version>/...`), so a link never breaks
  when a newer release comes out. The file names mirror the GoReleaser and NSIS templates; if
  those change, `release-catalogue.model.ts` changes with them.
- `english.messages.ts`: the hero pill (`hero.releaseHeadline`) and the three bullets of
  `download.releaseNotes`.

The repository URL and the Ko-fi page are in the same config file, next to the version.

## Deploying

`pnpm build:landing` writes the site to `packages/ui-landing/dist/browser`. Nothing in it needs Node:
serve the folder.

### With Docker

The image builds the site and serves it with nginx as an unprivileged user on port 8080. Build it
from the root of the repository, since the lockfile, the web app and the Go core live there:

```bash
docker build --file packages/ui-landing/Dockerfile --tag rrd-analyzer-landing .
docker run --rm --publish 8080:8080 rrd-analyzer-landing
```

or, on the server, `docker compose up --build -d` inside `packages/ui-landing` (the compose file runs
the container read-only, with no capabilities). Put TLS in front of it with whatever already
terminates HTTPS on the server.

### On an existing nginx

Copy `dist/browser` to the server and point a server block at it, starting from
`nginx/landing.conf`: it sets the cache headers (hashed bundles cached for a year, pages and the
WebAssembly module revalidated on every visit), gzip, and the security headers. The Content
Security Policy allows no inline script anywhere; `/app/` adds `'wasm-unsafe-eval'` and
`worker-src 'self'`, which compiling the module and starting its worker need. Whatever serves the
site must send `.wasm` files as `application/wasm`.

The app reads its font from `/fonts/`, which the landing page provides at the root of the site:
the two are meant to be deployed together.
