# Screenshot comparison

Drives the running application into the states the reference design was captured in,
photographs each one at 924×540 in `America/Sao_Paulo`, and diffs the result against the
reference captures in `spec/screenshots` and, for the crosshair tooltip and the canvas export,
`spec/new-spec/screenshots`. The three export-output scenarios fix the clock to the time printed in
the reference footer, export through the menu, and lay the downloaded 1920 × 1080 PNG into the same
viewer frame the reference shows it in, so the exported document itself is what gets compared.

```bash
pnpm start:daemon:scratch   # terminal 1, the Go use cases over HTTP on :34115, on a throwaway library
pnpm start                  # terminal 2, the web app on :4200
pnpm design:check           # photographs every scenario into shots/ and prints the diff per scenario
```

Every scenario resets the library before it seeds its own, so the daemon it runs against must not
be `pnpm start:daemon`: that one serves the development library in `~/.rrd-analyzer`, and the check
would delete it. `start:daemon:scratch` serves a library under `$TMPDIR` instead.

`scenarios.mjs` names one scenario per reference capture, and each name matches the capture's file
name. `shoot.mjs` takes scenario name fragments as arguments to photograph a subset
(`node tools/design-check/shoot.mjs 22-insights 23-insights`), reads `APP_URL` when the web server
is not on port 4200 and `OUT_DIR` to write somewhere other than `shots/`. `compare.py` reads the same
`OUT_DIR`, and `REFERENCE_DIR` to compare against captures kept elsewhere; it writes a diff image
per scenario into `shots/diff/`.

The references were captured in Chrome on Windows with classic scrollbars, so `shoot.mjs` reserves
the same scrollbar gutters before each photograph. What remains after that is glyph rasterisation,
which differs by a percent or two between platforms.
