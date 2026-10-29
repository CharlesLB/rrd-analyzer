# RRD Analyzer share service

The Cloudflare Worker behind live sessions: the public links an analysis is shared through, which
follow the owner's changes and are erased one hour after the last activity. The protocol it speaks
is in [docs/SHARING.md](../../docs/SHARING.md).

The same Worker serves the public site, the landing page and the browser app built by
`packages/ui-landing`, as static assets. Only `/api/*` runs Worker code.

## What it keeps, and for how long

- **One Durable Object per session** (`LiveSession`, SQLite-backed). It holds the session's record —
  the SHA-256 of the owner token, the revision, the expiry, the bytes and files stored so far — and
  an alarm set one hour after the last activity. It also holds the viewers' WebSockets, through the
  hibernation API, so a viewer waiting for the next revision costs nothing.
- **One R2 bucket** (`SESSION_BLOBS`) with the sealed blobs, under `sessions/{sessionId}/`: the
  state, and every chunk of every file. The service never sees a key: everything in it was encrypted
  by the owner's app.
- **When the alarm fires**, or the owner ends the session, every blob under the session's prefix is
  deleted, the object's storage is erased and every viewer is told the session expired. A request
  that arrives after the expiry but before the alarm ran erases the session itself and answers
  `404`.

Creating sessions is rate limited per client address (`SESSION_CREATION_LIMITER`, 10 a minute).
A session holds at most 256 files and 256 MiB, in chunks of at most 8 MiB (288 chunks in all, one
per file plus the 32 its bytes can fill, so erasing a session stays a few R2 calls), and a state of
at most 4 MiB. A viewer reading the state streams it from R2 through the Worker, not through the
session's object, and renews the session only when that moves its expiry by a minute or more.

## Working on it

From the root of the repository:

```bash
pnpm install
pnpm start:share-service                              # wrangler dev on http://localhost:8787
pnpm --filter @rrd-analyzer/share-service test        # Vitest inside workerd, watching
pnpm --filter @rrd-analyzer/share-service test:ci     # once, with the 100% coverage gate
pnpm --filter @rrd-analyzer/share-service typecheck
```

`wrangler dev` simulates R2, the Durable Objects and the rate limiter locally, under `.wrangler/`
(ignored by git). It serves the site from `../ui-landing/dist/browser`, so run `pnpm build:landing`
first when the pages matter; the API answers either way. To let the browser app on its development
server (`pnpm start:browser`, port 4210) reach it across origins, run it with the origin allowed:

```bash
pnpm --filter @rrd-analyzer/share-service exec wrangler dev --port 8787 --var ALLOWED_ORIGINS:http://127.0.0.1:4210
```

Any limit can be overridden the same way, `--var INACTIVITY_MILLISECONDS:15000` to watch a session
expire in seconds. A var given on the command line, or set as text in the dashboard, arrives as a
string, and the Worker reads a string of digits as the number it spells.

The tests run the Worker in workerd through `@cloudflare/vitest-plugin`, with every binding
simulated and small limits set in `vitest.config.ts`, so a test can reach a limit with a few bytes.

## Deploying

Nothing here deploys on its own; these are the steps, run once per account and then on every
release. They need a Cloudflare account logged in with `wrangler login`.

1. **Create the bucket** and give it a safety net: anything under `sessions/` that outlived a
   missed alarm is deleted after a day.

   ```bash
   pnpm --filter @rrd-analyzer/share-service exec wrangler r2 bucket create rrd-analyzer-sessions
   pnpm --filter @rrd-analyzer/share-service exec wrangler r2 bucket lifecycle add rrd-analyzer-sessions sessions-safety-net sessions/ --expire-days 1
   ```

2. **Build the site** with the address it will be served from, so the browser app shares sessions
   through this same Worker:

   ```bash
   SHARE_SERVICE_URL=https://rrd-analyzer.example.com RELEASE_VERSION=1.2.3 pnpm build:landing
   ```

3. **Deploy** the Worker with the site beside it:

   ```bash
   pnpm --filter @rrd-analyzer/share-service deploy
   ```

4. **Build the desktop app** with the same `SHARE_SERVICE_URL`, so its *Share live* button points
   here. A build without it has no share button.

The static site carries the security headers `nginx/landing.conf` sets, from
`packages/ui-landing/public/_headers`; the API sets its own (`Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`). `ALLOWED_ORIGINS` stays empty in production, where the app and
the API share one origin.

## What it costs

On the Workers Free plan, a personal project's sessions stay inside the free allowances: storage is
billed by the GB-month and nothing lives longer than an hour past its last use, and R2 charges
nothing for downloads. The Free plan's daily request cap also bounds what abuse could cost, since
the bucket is only reachable through the Worker.
