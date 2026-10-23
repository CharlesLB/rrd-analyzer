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

## Deploying

`pnpm build:landing` writes the site to `packages/ui-landing/dist/browser`. Nothing in it needs Node:
serve the folder.

### With Docker

The image builds the site and serves it with nginx as an unprivileged user on port 8080. It is built
from the root of the repository, since the lockfile, the web app and the Go core live there, from a
context with no `.git` in it, so the versions come in as build arguments: `RELEASE_VERSION`, the
release the downloads link to, is required, and `VERSION` and `COMMIT` name the build the app
reports. The `docker:build` script passes all three from the checkout:

```bash
pnpm --filter @rrd-analyzer/ui-landing docker:build
pnpm --filter @rrd-analyzer/ui-landing docker:run
```

or, on the server, inside `packages/ui-landing` (the compose file runs the container read-only, with
no capabilities, and refuses to build without `RELEASE_VERSION`):

```bash
RELEASE_VERSION="$(tools/release-version.sh)" VERSION="$(git describe --tags --always --dirty)" \
  COMMIT="$(git rev-parse HEAD)" docker compose up --build -d
```

Put TLS in front of it with whatever already terminates HTTPS on the server.

### On an existing nginx

Copy `dist/browser` to the server and point a server block at it, starting from
`nginx/landing.conf`: it sets the cache headers (hashed bundles cached for a year, pages and the
WebAssembly module revalidated on every visit), gzip, and the security headers. The Content
Security Policy allows no inline script anywhere; `/app/` adds `'wasm-unsafe-eval'` and
`worker-src 'self'`, which compiling the module and starting its worker need. Whatever serves the
site must send `.wasm` files as `application/wasm`.

The app reads its font from `/fonts/`, which the landing page provides at the root of the site:
the two are meant to be deployed together.
