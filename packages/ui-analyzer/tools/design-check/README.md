# Screenshot comparison

Drives the running application into a fixed set of states, photographs each one at 924×540 in
`America/Sao_Paulo`, and diffs the photographs against another set taken the same way. It is how a
change that only moves styles is proven: photograph the commit before, photograph the current one,
and compare the two sets with each other. The three export-output scenarios fix the clock, export
through the menu, and lay the downloaded 1920 × 1080 PNG into a viewer frame, so the exported
document itself is what gets compared.

```bash
pnpm start:daemon:scratch   # terminal 1, the Go use cases over HTTP on :34115, on a throwaway library
pnpm start                  # terminal 2, the web app on :4200

git checkout <commit before>
OUT_DIR=/tmp/shots-before node tools/design-check/shoot.mjs
git checkout -
REFERENCE_DIR=/tmp/shots-before pnpm design:check   # photographs into shots/ and prints the diff per scenario
```

Every scenario resets the library before it seeds its own, so the daemon it runs against must not
be `pnpm start:daemon`: that one serves the development library in `~/.rrd-analyzer`, and the check
would delete it. `start:daemon:scratch` serves a library under `$TMPDIR` instead.

`shoot.mjs` takes scenario name fragments as arguments to photograph a subset
(`node tools/design-check/shoot.mjs 22-insights 23-insights`), reads `APP_URL` when the web server
is not on port 4200 and `OUT_DIR` to write somewhere other than `shots/`. `compare.py` reads the same
`OUT_DIR` and requires `REFERENCE_DIR`, the set to compare against; it writes a diff image per
scenario into `shots/diff/`.

The scenarios seed analyses relative to the current time, so two runs of the same commit already
differ in the sparkline strip and the tooltip. Take the commit before twice and the current one
once: a change that only moves styles differs from the earlier set in the regions, and only the
regions, where the earlier set differs from itself. `shoot.mjs` reserves classic scrollbar gutters
before each photograph, so a system with overlay scrollbars photographs the same layout as one with
classic ones.
