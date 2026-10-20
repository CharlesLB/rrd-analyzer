import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { DESIGN_CHECK_COLORS } from '../../src/app/shared/constants/colors.ts';
import { scenarios } from './scenarios.mjs';

const PINNED_CHROMIUM_BUILD = 'chromium-1234';
const CHROMIUM_EXECUTABLE = `${process.env.HOME}/.cache/ms-playwright/${PINNED_CHROMIUM_BUILD}/chrome-linux64/chrome`;
const APPLICATION_URL = process.env.APP_URL || 'http://127.0.0.1:4200';
const DAEMON_RESET_URL = 'http://127.0.0.1:34115/api/dev/reset';
const OUTPUT_DIRECTORY = process.env.OUT_DIR || new URL('./shots', import.meta.url).pathname;

const SCROLLBAR_SIZE_PIXELS = 15;
const SCROLLBAR_TRACK_INSET_PIXELS = 3;
const SCROLLBAR_THUMB_RADIUS_PIXELS = 8;
const SHELL_TIMEOUT_MILLISECONDS = 15_000;
const GUTTER_SETTLE_MILLISECONDS = 120;
const REPORTED_ERROR_COUNT = 3;

const requestedNames = process.argv.slice(2);
const matchesRequest = (name) => requestedNames.length === 0 || requestedNames.some((requested) => name.includes(requested));
const selectedScenarios = Object.entries(scenarios).filter(([name]) => matchesRequest(name));

const referenceScrollbarStyle = [
  `::-webkit-scrollbar{width:${SCROLLBAR_SIZE_PIXELS}px;height:${SCROLLBAR_SIZE_PIXELS}px}`,
  `::-webkit-scrollbar-track{background:${DESIGN_CHECK_COLORS.scrollbarTrack}}`,
  `::-webkit-scrollbar-thumb{background:${DESIGN_CHECK_COLORS.scrollbarThumb};border:${SCROLLBAR_TRACK_INSET_PIXELS}px solid ${DESIGN_CHECK_COLORS.scrollbarTrack};border-radius:${SCROLLBAR_THUMB_RADIUS_PIXELS}px}`,
].join('');

const reserveReferenceScrollbarGutters = async (page) => {
  await page.addStyleTag({ content: referenceScrollbarStyle });
  await page.evaluate((scrollbarSize) => {
    document.querySelectorAll('*').forEach((element) => {
      const style = getComputedStyle(element);
      const scrollsHorizontally = style.overflowX === 'auto' || style.overflowX === 'scroll';

      if (scrollsHorizontally && element.scrollWidth > element.clientWidth) {
        element.style.paddingBottom = `${Number.parseFloat(style.paddingBottom) + scrollbarSize}px`;
      }
    });

    document.querySelectorAll('*').forEach((element) => {
      const style = getComputedStyle(element);
      const scrollsVertically = style.overflowY === 'auto' || style.overflowY === 'scroll';

      if (scrollsVertically && element.scrollHeight > element.clientHeight) {
        element.style.scrollbarGutter = 'stable';
      }
    });
  }, SCROLLBAR_SIZE_PIXELS);
  await page.waitForTimeout(GUTTER_SETTLE_MILLISECONDS);
};

const browser = await chromium.launch({
  executablePath: CHROMIUM_EXECUTABLE,
  args: ['--force-device-scale-factor=1', '--font-render-hinting=none', '--disable-features=OverlayScrollbar,FluentOverlayScrollbar,FluentScrollbar'],
});

const newContext = () =>
  browser.newContext({
    viewport: { width: 924, height: 540 },
    deviceScaleFactor: 1,
    timezoneId: 'America/Sao_Paulo',
    locale: 'en-US',
  });

const collectedErrorsOf = (page) => {
  const errors = [];

  page.on('pageerror', (pageError) => errors.push(String(pageError)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  return errors;
};

const openOnAnEmptyLibrary = async (page) => {
  const landing = await page.goto(`${APPLICATION_URL}/#/`, { waitUntil: 'networkidle' });

  if (landing === null || !landing.ok()) {
    throw new Error(`${APPLICATION_URL} did not answer, so start the web and daemon dev servers first`);
  }

  await page.waitForSelector('.app-shell', { timeout: SHELL_TIMEOUT_MILLISECONDS });
  await page.evaluate(async (resetUrl) => {
    await fetch(resetUrl, { method: 'POST' });
  }, DAEMON_RESET_URL);
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
};

// eslint-disable-next-line security/detect-non-literal-fs-filename -- OUTPUT_DIRECTORY is this tool's own output directory, taken from its own env var and never from user input
fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

const shoot = async (name, run) => {
  const context = await newContext();
  const page = await context.newPage();
  const errors = collectedErrorsOf(page);

  try {
    await openOnAnEmptyLibrary(page);
    await run(page);
    await reserveReferenceScrollbarGutters(page);
    await page.screenshot({ path: `${OUTPUT_DIRECTORY}/${name}.png` });
    console.log('OK  ', name, errors.length ? `  ERRORS: ${errors.slice(0, REPORTED_ERROR_COUNT).join(' | ')}` : '');
  } catch (failure) {
    console.log('FAIL', name, String(failure).split('\n')[0]);
    await page.screenshot({ path: `${OUTPUT_DIRECTORY}/${name}.png` }).catch(() => {});
  }

  await page.close();
  await context.close();
};

await selectedScenarios.reduce(async (shotSoFar, [name, run]) => {
  await shotSoFar;

  return await shoot(name, run);
}, Promise.resolve());

await browser.close();
