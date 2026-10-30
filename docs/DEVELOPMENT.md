# Developing RRD Analyzer

How the application is put together, how to run it, and how a release is made. For what it
does and where to download it, see the [README](../README.md).

Built as a **Wails v2** application: a Go backend behind a native window, and an Angular
frontend rendering the UI. There is no chart, component or CSS library. Every chart, sparkline
and insight overlay is inline SVG drawn from the workspace's own geometry
(`modules/workspace/models/plot-geometry`), and every control is a plain element styled from one
set of design tokens in `src/styles/_tokens.scss`. The one bundled asset is the Nunito font; the
icons are unicode glyphs.

## Layout

```
packages/
├── daemon/                        the Go module
│   ├── cmd/rrd-analyzer/          desktop binary: embeds the built web app, native dialogs
│   │                              and wails.json, which has to sit beside package main
│   ├── cmd/rrd-analyzer-dev/      HTTP server over the same use cases, for browser development
│   ├── cmd/rrd-analyzer-web/      the core compiled to WebAssembly, for the browser edition, and
│   │                              the web worker script it runs in
│   ├── cmd/internal/surface/      the transport-neutral operations every binary exposes
│   ├── cmd/internal/httpsurface/  those operations as HTTP routes, served by the development
│   │                              server on a port and by the browser edition in process
│   ├── internal/analysis/         the library of analyses, their canvases and the windows they serve
│   ├── internal/insights/         rule-based findings: classifier, detectors, causal join, reports
│   ├── internal/rrd/              reading .rrd / .xml dumps into series
│   ├── internal/series/           aggregation, consolidation and statistics
│   ├── internal/export/           CSV encoding, export file names and writing exports to disk
│   ├── internal/sharing/          live sessions: sealing, publishing and following an analysis
│   │                              through the share service (docs/SHARING.md)
│   └── internal/shared/           config, clock, sentinel errors, metric names, product strings
│
│   Every domain carries domain/ (entities, ports, constant sentinel errors),
│   usecase/ (rules) and infrastructure/ (adapters).
├── shared/                        the workspace's text: the i18n catalogue and its helpers
│   └── src/i18n/                  the Messages contract, the English catalogue, plural/format
│
├── ui-shared/                     the Angular pieces both apps run: the theme store, the
│   │                              media-query signal and the script that applies the stored
│   │                              theme before Angular loads; compiled by each app from source
│   ├── src/public-api.ts          what the apps import
│   ├── src/testing.ts             the browser-storage and system-theme fixtures their specs use
│   └── assets/theme-boot.js       copied next to each app's index.html by its angular.json
│
├── ui-analyzer/                   the app's interface, Angular: standalone OnPush components, signals;
│   │                              one code base built for the desktop window and for the browser
│   ├── src/app/modules/<feature>/ a screen whole: pages, components and the models only it reads
│   ├── src/app/stores/<domain>/   all the state, by domain: store/, data-access/ and models/
│   ├── src/app/core/              the gateways to the core and the app's configuration
│   ├── src/app/shared/            reusable components, directives and utilities
│   ├── e2e/                       Playwright suites over the real UI and daemon
│   └── tools/design-check/        photographs the reference states and diffs them
│
└── ui-landing/                    the public site: the landing page, prerendered to static HTML, and
                                   the browser build of ui-analyzer at /app/, deployed on their own
                                   (Dockerfile, nginx config); see packages/ui-landing/README.md

packaging/linux/                   desktop entry and icon that go into the .deb and the Arch package
packaging/windows/                 NSIS installer script and the executable's version metadata
tools/                             golangci-lint, the Windows installer, signing, local release
```

A pnpm workspace: `pnpm-workspace.yaml` covers `packages/*`, Biome is configured once at
the root and extended by ui-analyzer and ui-landing, and `.golangci.yml` covers the daemon.

Dependencies point inward only. The composition root in
`packages/daemon/cmd/rrd-analyzer/desktop/build.go` is the only place that knows about every
domain. In ui-analyzer every store and repository lives under `src/app/stores/<domain>/`,
which owns the state, the calls that fill it and the shapes both speak; a module holds the
screen that reads them. A page reads signals from a store and calls its actions, a component
takes inputs and emits outputs, and neither ever reaches a repository or the gateway. A domain
whose store does several jobs splits into stores of that same domain — the workspace has one
for the analysis and its canvas, one for the readings of the visible window and one for a drag
across it — and they depend on each other in one direction only.

## Text and translations

No user-facing string is written at its point of use. `@rrd-analyzer/shared` holds the
`Messages` contract and the English catalogue that satisfies it, plus `formatMessage` for
named placeholders and `formatPlural` for counted nouns. The web app reads the catalogue
through `I18nStore`, so a component says `texts().library.analysisDeleted` and a second locale is a
second catalogue rather than a sweep through the templates. The Go side keeps its own strings,
the ones a person sees before the frontend loads, in `internal/shared/messages`.

## Where your work is kept

The library starts empty and everything in it is yours: an analysis exists only once you
create one. It is stored in a **SQLite** database at `~/.rrd-analyzer/analyses.db`, in two
tables: the analyses, each with the canvas it was left with, and the sources each one names,
with a foreign key so deleting an analysis takes its sources with it.
`sqlite3 ~/.rrd-analyzer/analyses.db` is a supported thing to do.

The canvas is saved as the chart references it holds, a series identifier and its label. The
label travels with the identifier so the library can describe a canvas ("2 charts ·
system_cpu_user, system_memory_used") without reading the files behind it. A chart that other
series were merged into keeps those two fields for its first series and lists the rest under
`merged`, each with its label and the number of the value axis it is read against, the first
series always being on axis 0. An earlier build ignores `merged` and opens such a chart on its
first series, so a database never becomes unreadable by going back a version.

The frontend owns the axis layout. After opening a canvas and after every change it renumbers a
chart's axes from its first series with no gaps, and splits any axis that would read two units,
so the daemon never has to know what a unit is. Only the ceilings live in the daemon as well: five
charts on a canvas, five series in a chart, and no axis number a chart of that size cannot have.

The driver is `modernc.org/sqlite`, which is SQLite translated into Go rather than a C
binding. That is what lets the Windows half of the release cross-compile with `CGO_ENABLED=0`.

A library written by an earlier version, in `analyses.json`, is imported the first time the
database is opened, and the json file is left exactly where it was. A database written before
canvases were saved gains the column on open, with every canvas empty.

## Running it

### Desktop application

The native window needs GTK and WebKit development packages:

```bash
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev          # Debian/Ubuntu
make install
make dev                                                     # or make desktop
```

`make dev` opens the window with live reload; `make desktop` builds the Angular app, embeds it
and writes the binary to `packages/daemon/bin/`.

Both go through the Makefile rather than through a package script, because both need something
the Wails CLI does not supply on its own. `make desktop` compiles with the **same build tags
goreleaser sets** — `desktop,production` everywhere and `webkit2_41` on Linux — so a local build
and a release cannot link differently; `desktop` and `production` are what select the real
WebKitGTK window and the embedded frontend, and without them the binary starts and draws
nothing. `make dev` passes `webkit2_41` through to `wails dev` for the same reason.

### Frontend on its own

The frontend also runs in a browser against a development server that exposes the same
use cases over HTTP, which is useful for UI work and is how the design check is run:

```bash
pnpm install
pnpm start:daemon                # the Go use cases over HTTP on :34115
pnpm start                       # the Angular app on :4200
```

The development server runs the built-in insights rules. Pass
`-insights-configuration <directory>` to it to try a `rules.toml`, `classifier.toml` or
`units.toml` of your own.
It answers browser calls only from the web app's own origins, `http://localhost:4200` and
`http://127.0.0.1:4200`, so no other page open in the browser can reset the development library;
pass `-web-origin` to serve the app from somewhere else. Live sessions are off unless it is given a
share service, `-share-service http://127.0.0.1:8787` for the one `packages/share-service` runs locally.

Wails' own dev server defaults to the API's port, so `make dev` moves it to `:34116` rather
than the API moving. Without that they collide, and the failure is misleading: a Wails server
still holding `:34115` answers `/api` requests with the dev page, which the browser reports as
a CORS error instead of as the wrong server.

In the browser the native dialogs do not exist, so picking sources uses a file input
and exports download through the browser. In the desktop window both go through Go.

### The browser edition

The same frontend also ships with no server at all, as the app the public site serves at `/app/`.
`cmd/rrd-analyzer-web` is the Go core compiled to WebAssembly (`GOOS=js GOARCH=wasm`): it builds
the whole surface with the library, the search history and every opened file kept in memory
(`MemoryStore` in `analysis` and `searches`, `internal/shared/memoryfiles`), opens on a sample
analysis, and serves `cmd/internal/httpsurface` — the exact routes the development server answers —
in process. It runs in a web worker (`analyzer.worker.js`, beside it), so a run of insights never
blocks the page.

The sample is `browser/sampleanalysis`: two weeks of a made-up HTTP API, generated from fixed seeds
at startup as ten rrdtool dumps and kept like any file a visitor opens, plus the NDJSON log the
service wrote over the same weeks. Its incidents are shaped for four findings — an out-of-memory
kill after a leak, CPU saturation under a bulk import, a deployment's restart and a latency drift —
and `edition_test.go` pins them. Logs never reach the core, so `GET /api/sample-analysis` hands the
log to the page, whose `SampleAnalysisStore` opens it on the sample's first visit in the tab as if
it had been dropped.

On the frontend, `WebAssemblyGateway` is the third gateway, chosen when the build replaces
`core/config/edition.config.ts` with its browser twin. It shares every route with
`BrowserGateway` through `ApiGateway`, and differs only in its transport: it posts each request to
the worker instead of fetching it, and hands a picked or dropped file's bytes to the worker, which
keeps them under a `memory:/` path the analysis names. Nothing leaves the tab unless the person
shares an analysis live, and closing or reloading it erases everything; the app says so in a bar
across its top.

### Live sessions

*Share live* turns the open analysis into a public link that follows the owner's changes and is
erased one hour after its last activity. The protocol, the encryption and the lifecycle are in
[SHARING.md](SHARING.md); the three parts that speak it are `packages/share-service` (the Cloudflare
Worker), `internal/sharing` in the core, and `stores/sharing` in the frontend:

- `SharingStore` (root) holds the sessions this app owns, which is what the library's *Local* and
  *Online* marks read, and asks the core for them again every minute while one is live.
- `LiveSessionStore` (one per workspace) opens the warning and the share panel, and publishes the
  analysis again a moment after any change settles: the canvas, the colors, the order of the
  library, the name, a source added, the log or the way it is shown. It waits for the workspace's
  own saves first, so the core always publishes what was stored.
- `SharedSessionStore` (root) is the other side: it joins a link (`#/shared/{sessionId}/{key}`),
  watches the session over a WebSocket (`core/live-updates`), takes each newer revision, and when the
  session ends erases the analysis from the tab and sends the page back to the library.

```bash
pnpm start:browser               # builds the WebAssembly runtime, serves the app at :4210/app/
pnpm build:landing               # the whole public site, landing page and app, in packages/ui-landing/dist
```

Both need Go: `tools/build-browser-runtime.sh` writes the module, Go's own `wasm_exec.js` (copied
from the toolchain that built the module, never kept in the repository) and the worker script to
`packages/ui-analyzer/browser-runtime`, which the `browser` configuration copies beside the app. The
SQLite stores are left out of the js build by a `!js` build constraint; everything else in the
core compiles to WebAssembly unchanged.

Neither build names a version by hand; both read the git tags, the way GoReleaser does for the
desktop. The module carries the build identity the Makefile stamps into the desktop build
(`git describe --tags --always --dirty`, the commit and its date, or `VERSION`, `COMMIT` and
`COMMIT_DATE` when set), and the share service live sessions go to, `SHARE_SERVICE_URL`, stamped
into `internal/shared/shareservice` the same way by the Makefile, `tools/build-browser-runtime.sh` and
the GoReleaser configurations. Left unset, a build shares nothing and shows no share button. The landing page links its downloads to the latest stable tag, or to
`RELEASE_VERSION`, and `pnpm build:landing` stops when there is neither, since every download button
would point at a file that does not exist; see packages/ui-landing/README.md. The `browser` package of `cmd/rrd-analyzer-web` is tested
natively and, compiled to WebAssembly, under Node:

```bash
cd packages/daemon && GOOS=js GOARCH=wasm go test -exec="$(go env GOROOT)/lib/wasm/go_js_wasm_exec" ./cmd/rrd-analyzer-web/browser/
```

Go's executor refuses a large environment, so run that from a shell with few variables set.

The PNG and SVG exports are composed in the frontend, which owns the palette and the typography:
`models/export-document` builds a 1920 × 1080 SVG from 960 buckets of each series, the browser
engine rasterises it onto a canvas, and `ExportImage` hands the finished bytes to Go, which only
opens the native save dialog and writes them. Go never re-renders a chart. The SVG resolves every
color to a literal hex and embeds the bundled Nunito subset as a `@font-face`, because an SVG loaded
as an image cannot see the page's fonts; the same file therefore renders the same in resvg or any
other renderer. The CSV stays a backend export, scoped to the chart its menu was opened from.

## Reading RRD files

`ParseDump` accepts either an `rrdtool dump` XML file or a binary `.rrd`. The binary
format is decoded in place by `DecodeBinary`: rrdtool writes an 8-byte-word,
little-endian structure whose float cookie at offset 16 proves the word size and byte
order, and whose header describes the file's own length exactly. `CanDecodeBinary`
insists on both before the parser touches a byte, so a database from a 32-bit or
big-endian machine falls through to `rrdtool dump` instead of being misread. Each
archive is a ring that starts wherever the writer last stopped, so the rows are
unrolled from `cur_row` on the way out.

Archives are kept **at the resolution the file stores them in**, side by side, rather
than projected onto one uniform grid. A read picks the finest archive that has a
reading for the column it is filling and falls through to the coarser history behind
it, so the long low-resolution past and the recent detail still draw as one continuous
line — without paying a year of minute-wide slots for a year of daily rows. A file
holding a day of minutes behind a year of days costs its own rows: roughly 7,500
samples rather than half a million.

A column reads the rows stamped inside it, and always at least the one under it, so a column
narrower than the step still shows a reading. The charts, the statistics and the export all
read `AVERAGE`; the `MIN`, `MAX` and `LAST` archives a file keeps are there for the insights
engine, which falls back to `AVERAGE` when a file archives no such consolidation or keeps it for
less time than the range it reads reaches back. An archive
named by anything else — a Holt-Winters prediction band, its failure flags — is dropped rather
than read as if it were measured data.

RRD stores no unit metadata, so a `GAUGE` source renders as `n/a` and a rate source
(`COUNTER`, `DERIVE`, `ABSOLUTE`) as `/s`. This is the `n/a` state the design accounts
for.

The library starts empty: the application ships no example data, and the first thing it shows is
the invitation to create an analysis.

A synthetic dataset does exist, but only as a development and test fixture. A browser file input
cannot tell the server where a file lives, so the frontend running outside the desktop window has
no path to hand over; `cmd/rrd-analyzer-dev` stands the fixture in for those path-less sources so
the browser flow, the end-to-end suite and the design check have something to plot. The desktop
binary never builds it, because it only ever has real paths, and `synthetic_loader_test.go` pins the
fixture to the exact values the design was drawn from.

## Insights

Insights are **beta**. The rules, their thresholds and their wording are still moving, the panel
carries a beta badge, and a default rule may be renamed or dropped between releases — a user rule
that overrides one by `id` can therefore stop overriding anything.

`internal/insights` turns the series an analysis already parsed into ranked findings. It never
opens a file: `analysis/usecase.InsightsSource` serves it the same archives the charts draw, so a
finding and the chart beneath it cannot disagree about the data.

A run goes through four steps:

1. **Classify.** `usecase/classify` maps each series to a semantic type (`cpu.user`,
   `memory.used`, `http.latency`, …) from its file name, data source name and type. A series
   nothing matches is reported back as unclassified rather than guessed at, and the panel says so.
2. **Detect.** `usecase/signal` finds the episodes each condition asks for (gaps, excursions,
   drifts and the other detectors the rules name), reading unknown rows as missing rather than as
   zero.
3. **Join.** `usecase/engine` anchors each rule on its trigger and joins the other conditions to
   it by ordering (`after` with `within`), overlap and lookback, then scores confidence from how
   pronounced the episodes are and how tightly the ordering holds.
4. **Render.** `usecase/render` fills the rule's cause sentence with the numbers behind it,
   formatted the way the panel shows them.

The engine reads a series across its archives the way the charts do, each instant from the finest
archive that covers it, with one difference: a hole inside an archive stays a hole even where a
coarser archive holds a reading, because the coarse row averages over the outage the hole records.
Its span starts at the oldest reading rather than at the start of the oldest archive, since rrdtool
allocates a year-long archive whole and its unwritten months would read as an outage; a series
that never stored a reading is named in the report's warnings. A whole-data run reads at the finest
step while that stays within the sample budget; past it, the scan reads coarse first and re-reads
only the regions where a rule matched. A condition whose `repeats` fall closer together than the
coarse step can tell apart is looked for as a single episode in the coarse pass and counted in the
region, because a burst of restarts averages into one coarse bucket; repeats spread over days are
counted in the coarse pass and kept there. A finding too wide to refine keeps its span, and each of
its short episodes is measured again at the finest step around itself, so a stuck reading lasting
weeks still quotes the minute-level surge beside it.

A rule can declare the more general rules it `supersedes`: where a finding of it overlaps one of
theirs, only the specific finding is reported, so a restart already explained by a leak, a restart
loop or a recurring-restart summary is not listed again on its own.
Reports are cached per analysis, scope, window, configuration and data fingerprint. The web app
keeps no cache of its own: every run asks the daemon, which answers a repeat at once, so a report is
never shown as another analysis's nor as one made under rules since edited. When the window comes
back into focus after a run it asks the daemon for the hashes of the rules in force
(`InsightsConfiguration`), and a run made under others is marked stale. A run lasts as long as the
work, and can be cancelled from the trigger's × or with <kbd>Esc</kbd>: the browser aborts the
request, the desktop names each run and calls `CancelInsights`, and the daemon stops a scan once
nobody is waiting on it.
The findings a run draws on the charts can be hidden without discarding the run, from the panel's
header or with <kbd>h</kbd>; a chart export then shades none of them. A new run, or framing a
finding with Show on chart, draws them again.

The rules and the classifier are TOML. The defaults live next to the code that parses them,
`internal/insights/usecase/rules/defaults/rules.toml` and
`internal/insights/usecase/classify/defaults/classifier.toml`, are embedded in the binary, and
document the grammar at the top of each file. A person can lay their own over them in the platform
configuration directory, `~/.config/rrd-analyzer/` on Linux and `%AppData%\rrd-analyzer\` on
Windows:

- `rules.toml`: a rule with the `id` of a default replaces it; any other `id` adds a rule.
- `classifier.toml`: its `[[match]]` entries are tried before the defaults.

Both are re-read on the first run after they change, without a restart. A rule that does not parse
is left out and named in the report's warnings, and every other rule keeps running.

A series' unit is read from the words of its name (`percent`, `utilization` → `%`; `bytes`,
`octets`, `memory`, `heap`, `swap`, disk space → `B`; `ns`, `ms`, `seconds`), and a counter's gets
`/s`. A `units.toml` in the same directory overrides it for the series whose name matches a glob,
the first matching entry winning; it is re-read on the next chart read after it changes, and an
entry that does not parse is left out:

```toml
[[unit]]
series = "api_application_elasticsearch_*_rate"
unit = "ops/s"
```

`golden_test.go` pins the defaults to the findings the reference prototype produces over the
development dataset (titles, causes, intervals and every sparkline) for all data and for the last
24 hours, 3 days and 7 days.

## Quality

```bash
pnpm verify        # format:check, lint, typecheck, test, test:e2e, build
make test          # the same suites through the Makefile
pnpm design:check  # photograph the reference states and diff them, with both dev servers up
```

Biome formats and lints everything TypeScript from one root config; a small ESLint layer adds
what Biome does not cover: semantic blank lines through `@stylistic`, and the
`eslint-plugin-security` rules. golangci-lint covers the daemon through
`tools/golangci-lint.sh`, which pins its version and installs it on first use.

Unit tests are Vitest for the TypeScript packages and `go test -race` for the daemon, and `pnpm test`
fails below 100% coverage in every package. The TypeScript packages count statements, branches,
functions and lines (`coverageThresholds` in each `angular.json`, `thresholds` in
the `vitest.config.ts` of `packages/shared` and `packages/ui-shared`); the daemon counts statements across packages through
`tools/check-go-coverage.sh`, which lists every statement no test runs as file:line. The only
exclusions sit beside each threshold and are entry points: `main.ts`, `main.server.ts` and the
bootstrap configs, and each binary's `main.go` plus the js/wasm glue. A gap is closed with a test,
never with a coverage pragma or a new exclusion. `pnpm --filter <package> test` keeps watching
without coverage; `test:ci` is what measures. The end-to-end
suite is Playwright over the real UI and the real Go use cases: `pnpm test:e2e` starts both
servers itself, and `pnpm test:e2e:report` opens the last report. It always starts its own daemon,
on a library under `$TMPDIR`, and refuses to run while something else holds `:34115`: every test
resets the library it runs against, and reusing a `pnpm start:daemon` left running would delete
the development library in `~/.rrd-analyzer`. Stop it first; a running `pnpm start` is reused.
Live sessions run end to end too, against `wrangler dev` with its state under `$TMPDIR`: the
analyzer suite starts one share service on `:34190` and hands it to every daemon, so the desktop
journey shares files read off disk; the landing suite builds the site with `SHARE_SERVICE_URL`
pointing at `:4302`, where the `live-sessions` project opens the app from the Worker's own origin,
under the headers of `public/_headers`, as in production. A second service on `:4303` erases a
session 15 seconds after its last activity, and the expiry journey routes its traffic there instead
of waiting an hour. Each service creates at most ten sessions a minute, as deployed, so a journey
starts few. The design check is described
in [packages/ui-analyzer/tools/design-check](../packages/ui-analyzer/tools/design-check/README.md).

## Releasing

Releases are published from a workstation, so they spend no Actions minutes:

```bash
make publish v0.1.0          # or make publish TAG=v0.1.0; a bare make publish takes the tag on HEAD
```

`tools/publish-release.sh` needs the [GitHub CLI](https://cli.github.com), signed in with
`gh auth login`, and `makensis`. It first checks what takes a second: that the tree is clean,
that the tag is HEAD (creating it there when it does not exist yet), and that GitHub has no
different tag by that name. Then it runs `pnpm verify`, builds every artefact this host can link,
writes one `checksums.txt` over them, pushes the tag, and creates the release with generated
notes. A failing suite means no release rather than a broken one: nothing is pushed, and a tag
the script created is deleted again. gh keeps the release a draft until every asset has uploaded. Running it again on a tag that already has a release
replaces its assets, which is how a failed upload is retried; `SKIP_VERIFY=1` skips the suites
when they have already passed on that commit.

A workstation cannot link every target. An amd64 host builds linux/amd64 and Windows but not
linux/arm64, and the Linux artefacts inherit the host's glibc, so publish from Ubuntu 22.04 for
the same reason the workflow pins it (below).

`.github/workflows/release.yml` does the same on runners, arm64 included, and is started by hand
from the Actions tab with the tag to build. It no longer runs on a tag push: that would build
everything a second time and upload over the release `make publish` had just made.

The Linux halves build on `ubuntu-22.04`: the oldest image carrying the WebKitGTK 4.1 headers,
which is what sets the floor of who can run the result. glibc is forwards compatible but not
backwards, so linking on a newer image would quietly drop every distribution older than it.
arm64 uses GitHub's arm runner, free for public repositories. Windows cross-compiles on the same
image. Signing stays a no-op until `WINDOWS_SIGN_PKCS12`, a base64 `.pfx`, and
`WINDOWS_SIGN_PASSWORD` are set as repository secrets.

The binary links **WebKitGTK 4.1**, through Wails' `webkit2_41` build tag. Linking 4.0, which is
the default, is what used to confine the result to the Debian family: Arch and everything else
that moved to libsoup3 dropped the 4.0 stack, so the tarball installed and would not start. 4.1
is present everywhere 4.0 still is, so the change costs nothing and the `.deb` can depend on one
package rather than on an alternation apt could satisfy with the wrong one.

The same artefacts can be built locally, which is what the configurations are exercised with
before a tag exists:

```bash
make release                 # every artefact this host can build, into dist/
make release-linux           # .deb, Arch .pkg.tar.zst and .tar.gz only
make release-windows         # .exe + .zip, and the installer when makensis is present
make release-check           # validate the three configurations
```

`dist/` ends up holding the artefacts and nothing else: the packages, the archives, the bare
Windows executable as the portable option, the installer, and one `checksums.txt` over all of
them. GoReleaser's own scratch is cleared out: it writes a build directory and a pipeline's
worth of json per run, and since each configuration's `--clean` wipes the one before it, only
the last would survive to give half a picture.

The release is split into three GoReleaser configurations, one per target, because the window is
a native webview and no single host can link every platform's:

| Target | Artefacts | Built where |
|---|---|---|
| `linux-amd64`, `linux-arm64` | `.deb`, `.pkg.tar.zst`, `.tar.gz` | natively, with the GTK/WebKit headers `make deps` names |
| `windows` | `.exe`, `.zip`, installer `.exe` | anywhere, because Wails reaches WebView2 through a pure-Go binding, so it cross-compiles from Linux |

Each configuration runs with `--clean`, because GoReleaser refuses to start on a `dist/` it did
not empty itself and the OSS build has no `--dist` flag to keep them apart. `tools/release-local.sh`
stages each artefact out between runs and puts them all back, then writes one `checksums.txt` over
the lot. It builds only what the host can actually produce, checking for the WebKit headers
rather than discovering they are missing at the link step, and prints what it skipped and why,
so a partial `dist/` is never mistaken for a complete one.

The `.deb` installs the binary to `/usr/bin`, a desktop entry and a scalable icon, and depends on
the GTK and WebKit runtimes, with the alternation that covers the 4.1 rename on Debian 13 and
Ubuntu 24.04. `rrdtool` is a recommendation rather than a dependency: binary databases and XML
dumps are both read without it, and it is reached for only when a database was written in a
layout this build cannot read in place.

The Arch package, `.pkg.tar.zst`, comes out of the same nfpm entry as the `.deb`, so it carries the
same binary and the same files to the same places, and installs with `pacman -U`. Only the
dependency names differ, through an `archlinux` override: `gtk3` and `webkit2gtk-4.1`, whose
libsoup3 build is the soname the `webkit2_41` tag links. nfpm writes no `optdepends`, so `rrdtool`
is not declared there. Arch's own pacman hooks refresh the icon cache and the desktop database, so
the package needs no install script. Linking on Ubuntu 22.04 does not hold Arch back: the binary
asks for glibc 2.34, and a rolling release is always past that.

The Windows executable is linked `-H windowsgui`, so no console window appears behind it, and
carries a VERSIONINFO resource giving it a product name and publisher. `tools/sign-windows.sh`
applies an Authenticode signature when `WINDOWS_SIGN_PKCS12` is set and is a no-op otherwise, so
releases run unchanged until a certificate exists. `tools/build-nsis.sh` wraps the same signed
executable in a per-user installer that needs no elevation.

## Choices that are visible on screen

- **A library row describes its own canvas.** Each analysis saves the charts it was left with, so
  its row counts and names them, and reopening it restores them. A merged chart is one chart,
  named as its series joined by a plus.
- **Dropping a chart on the middle of another merges them; it no longer swaps them.** The reference
  design's middle drop zone swapped two canvas charts. It now merges a dragged chart into the one
  under it, and the top and bottom quarters still reorder. A card dragged from the library keeps
  Replace in the middle, since a series that is not on the canvas yet has nothing to merge.
- **A merge decides the axes, and a person can overrule it within a unit.** Series share an axis
  when they share a unit and the largest is at most ten times the smallest (a percentage counts as
  at least 100, the height its axis always shows); otherwise the series gets a new axis. The
  series menu offers only axes of the series' own unit: putting milliseconds against a percentage
  axis would need a conversion, and nothing is converted.
- **Undo covers the canvas, not the time window.** Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) step
  through the last fifty canvas changes of the open analysis: merges, separations, axis moves,
  additions, removals and reorders. Zoom keeps its own history behind ↩. Opening an analysis
  starts with nothing to undo, and a text field keeps its own Ctrl+Z.
- **The workspace reads its name from the analysis it opened**, so switching analyses cannot leave
  the previous one's series under the new one's name.
- **An insights run outlives the analysis it was run on, marked stale.** As in the reference
  design, the last run's pill stays in the bar with `↻` after moving to another analysis. Runs are
  keyed by analysis, so the stale count is the only thing that carries over: the other analysis
  paints, lists and exports none of those findings, and its pill runs insights for it instead of
  opening a panel of someone else's findings.
- **The window can be as narrow as a phone.** Below 760px the library becomes a strip of cards
  above the canvas and the bar drops pan and the duration; the desktop window's minimum width is
  400px so that layout is reachable.
