import { type Download, expect, type Page } from '@playwright/test';
import { EXPORT_COLORS, SERIES_COLORS } from '../../src/app/shared/constants/colors';
import { canvasOf, mergedChartOf, resetLibrary, seedWorkspace, toastMessage } from '../support/analyzer';
import { downloadedBytes, downloadFrom } from '../support/downloads';
import { test } from '../support/fixtures';
import { runInsights } from '../support/insights';
import { applyAbsoluteRange, boxOf, chartPanel, chartPanels, exportMenu, exportMenuItem, openExportMenu } from '../support/workspace';

const CPU_USER = 'atlas_system_cpu_user';
const MEMORY_USED = 'atlas_system_memory_used';
const FINDING_WINDOW = { from: '2026-08-17 11:07', to: '2026-08-19 00:28' } as const;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const MENU_GAP = 6;
const FULL_CANVAS_CHARTS = 5;
const LOW_CHART_INDEX = 4;

const exportFromChart = async (page: Page, chartTitle: string, format: string): Promise<Download> => {
  await openExportMenu(page, chartTitle);

  return await downloadFrom(page, async () => await exportMenuItem(page, format).click());
};

const pngSizeOf = (bytes: Buffer): readonly number[] => [bytes.readUInt32BE(PNG_WIDTH_OFFSET), bytes.readUInt32BE(PNG_HEIGHT_OFFSET)];

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('export menu', () => {
  test('Export in a chart header opens a popover under it, scoped to that chart over the window, with four formats and the whole canvas', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    const button = chartPanel(page, CPU_USER).locator('.chart-panel-header-export');

    await openExportMenu(page, CPU_USER);
    const buttonBox = await boxOf(button);
    const viewportWidth = page.viewportSize()?.width ?? 0;

    await expect(button).toHaveClass(/chart-panel-header-export-open/);
    await expect(page.locator('.export-menu-scope-label')).toHaveText('atlas_system_cpu_user · 24 h');
    await expect(page.locator('app-export-menu .menu-option-tag')).toHaveText(['PNG', 'COPY', 'SVG', 'CSV']);
    await expect(page.locator('.export-menu-all-label')).toHaveText('PNG of all 2 charts on the canvas');
    await expect(exportMenu(page)).toHaveCSS('top', `${Math.round(buttonBox.y + buttonBox.height + MENU_GAP)}px`);
    await expect(exportMenu(page)).toHaveCSS('right', `${Math.round(viewportWidth - (buttonBox.x + buttonBox.width))}px`);

    await page.locator('app-export-menu .anchored-menu-backdrop').click({ position: { x: 20, y: 400 } });

    await expect(exportMenu(page)).toHaveCount(0);
    await expect(button).not.toHaveClass(/chart-panel-header-export-open/);
  });

  test('Export in the header of a chart low in the window opens the popover upward, whole inside the window', async ({ page }) => {
    await seedWorkspace(page, { name: 'Full house', canvas: canvasOf('s3', 's5', 's1', 's2', 's4') });
    await expect(chartPanels(page)).toHaveCount(FULL_CANVAS_CHARTS);
    await expect(chartPanels(page).nth(LOW_CHART_INDEX)).toHaveCSS('opacity', '1');
    const lowChartTitle = (await page.locator('.chart-panel-header-title').nth(LOW_CHART_INDEX).textContent()) ?? '';
    const button = chartPanel(page, lowChartTitle).locator('.chart-panel-header-export');

    await openExportMenu(page, lowChartTitle);
    const buttonBox = await boxOf(button);
    const menuBox = await boxOf(exportMenu(page));
    const viewportHeight = page.viewportSize()?.height ?? 0;

    expect(Math.round(menuBox.y + menuBox.height)).toBe(Math.round(buttonBox.y - MENU_GAP));
    expect(menuBox.y).toBeGreaterThan(0);
    expect(menuBox.y + menuBox.height).toBeLessThan(viewportHeight);
    await expect(page.locator('.export-menu-all')).toBeInViewport({ ratio: 1 });
  });

  test('export menu closes on Escape and leaves the insights panel behind it open', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await runInsights(page);
    await openExportMenu(page, CPU_USER);

    await page.keyboard.press('Escape');

    await expect(exportMenu(page)).toHaveCount(0);
    await expect(page.locator('.insights-panel')).toBeVisible();
  });

  test('Export over a canvas of one chart leaves the whole-canvas row out, and the top bar offers no export of its own', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await openExportMenu(page, CPU_USER);

    await expect(page.locator('.export-menu-all')).toHaveCount(0);
    await expect(page.locator('.timeframe-bar-export')).toHaveCount(0);
  });

  test('Export on an empty canvas is not offered at all', async ({ page }) => {
    await seedWorkspace(page, { name: 'Untitled analysis' });

    await expect(page.locator('.chart-panel-header-export')).toHaveCount(0);
  });

  test('Export after insights have run says the findings will be shaded', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await runInsights(page);

    await openExportMenu(page, CPU_USER);

    await expect(page.locator('.export-menu-scope-label')).toHaveText('atlas_system_cpu_user · 24 h · findings shaded');
  });
});

test.describe('chart export', () => {
  test('CSV from a chart downloads that series alone over the last 24 hours, named after it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    const download = await exportFromChart(page, CPU_USER, 'CSV data');
    const lines = (await downloadedBytes(download)).toString('utf8').trim().split('\n');

    expect(download.suggestedFilename()).toBe('rrd_atlas-system-cpu-user_202608281500_202608291500.csv');
    expect(lines[0]).toBe('timestamp,atlas_system_cpu_user [%]');
    expect(lines).toHaveLength(289);
    await expect(toastMessage(page)).toHaveText('CSV exported · 288 samples × 1 chart');
  });

  test('PNG from a chart downloads a 1920 × 1080 image named after the chart and says so', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    const download = await exportFromChart(page, MEMORY_USED, 'PNG image');

    expect(download.suggestedFilename()).toBe('rrd_atlas-system-memory-used_202608281500_202608291500.png');
    expect(pngSizeOf(await downloadedBytes(download))).toEqual([1920, 1080]);
    await expect(toastMessage(page)).toHaveText('PNG exported · 1920×1080');
  });

  test('SVG from a chart downloads the document composed from its data, one chart filling the frame in literal colors', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    const download = await exportFromChart(page, CPU_USER, 'SVG vector');
    const markup = (await downloadedBytes(download)).toString('utf8');

    expect(download.suggestedFilename()).toBe('rrd_atlas-system-cpu-user_202608281500_202608291500.svg');
    expect(markup).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1920" height="1080"/);
    expect(markup).toContain('>2026-08-28 15:00  →  2026-08-29 15:00   ·   24 h window   ·   Atlas prod · capacity</text>');
    expect(markup).toContain(
      `<rect x="40" y="122.0" width="1840" height="880.0" rx="14" fill="${EXPORT_COLORS.light.card}" stroke="${EXPORT_COLORS.light.line}"/>`,
    );
    expect(markup).toContain('>960 samples per series   ·   exported ');
    expect(markup).toContain("@font-face{font-family:'Nunito'");
    expect(markup).not.toContain('var(');
    await expect(toastMessage(page)).toHaveText('SVG exported · 1920×1080 vector');
  });

  test('SVG from a merged chart draws it as one chart, a line and a swatch per series and its second axis labelled on the left, beside the first', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: [mergedChartOf('s3', ['s5', 1])] });

    const download = await exportFromChart(page, `${CPU_USER} + ${MEMORY_USED}`, 'SVG vector');
    const markup = (await downloadedBytes(download)).toString('utf8');
    const lines = markup.split('\n');

    expect(download.suggestedFilename()).toBe('rrd_atlas-system-cpu-user-atlas-system-memory-used_202608281500_202608291500.svg');
    expect(markup).toContain(`font-weight="700" fill="${EXPORT_COLORS.light.text}">${CPU_USER} + ${MEMORY_USED}</text>`);
    expect(lines.filter((line) => line.startsWith('<rect x="40"'))).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith('<path'))).toHaveLength(2);
    expect(lines.filter((line) => line.startsWith('<circle'))).toHaveLength(2);
    expect(lines.filter((line) => line.startsWith('<text x="138"') && line.includes(`fill="${SERIES_COLORS[5]}"`))).toHaveLength(4);
  });

  test('CSV from a merged chart holds the samples of every series in it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: [mergedChartOf('s3', ['s5', 1])] });

    await openExportMenu(page, `${CPU_USER} + ${MEMORY_USED}`);

    await expect(exportMenuItem(page, 'CSV data')).toContainText('raw samples for its 2 series');

    const download = await downloadFrom(page, async () => await exportMenuItem(page, 'CSV data').click());
    const [header] = (await downloadedBytes(download)).toString('utf8').split('\n');

    expect(header).toContain('system_cpu_user');
    expect(header).toContain('system_memory_used');
  });

  test('SVG in the dark theme follows it, resolved to the dark palette', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await page.locator('.theme-toggle').click();

    const markup = (await downloadedBytes(await exportFromChart(page, CPU_USER, 'SVG vector'))).toString('utf8');

    expect(markup).toContain(`<rect width="1920" height="1080" fill="${EXPORT_COLORS.dark.background}"/>`);
    expect(markup).toContain(`fill="${EXPORT_COLORS.dark.card}" stroke="${EXPORT_COLORS.dark.line}"`);
  });

  test('SVG over a finding shades it with its severity on every chart, labels it on the first and counts it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await runInsights(page);
    await applyAbsoluteRange(page, FINDING_WINDOW.from, FINDING_WINDOW.to);
    await openExportMenu(page, CPU_USER);

    const download = await downloadFrom(page, async () => await page.locator('.export-menu-all').click());

    expect(download.suggestedFilename()).toBe('rrd_202608171107_202608190028.png');
    await expect(toastMessage(page)).toHaveText('PNG exported · 1920×1080');

    const markup = (await downloadedBytes(await exportFromChart(page, CPU_USER, 'SVG vector'))).toString('utf8');

    expect(markup.match(/fill-opacity="0\.12"/g)).toHaveLength(1);
    expect(markup).toContain(`font-weight="700" fill="${EXPORT_COLORS.light.severities.critical}">CRITICAL</text>`);
    expect(markup).toContain('>1 finding shaded by severity   ·   960 samples per series');
    await expect(toastMessage(page)).toHaveText('SVG exported · 1920×1080 vector · 1 finding shaded');
  });

  test('PNG of all charts downloads one image of the whole canvas, named after the window alone', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await openExportMenu(page, MEMORY_USED);

    const download = await downloadFrom(page, async () => await page.locator('.export-menu-all').click());

    expect(download.suggestedFilename()).toBe('rrd_202608281500_202608291500.png');
    expect(pngSizeOf(await downloadedBytes(download))).toEqual([1920, 1080]);
    await expect(exportMenu(page)).toHaveCount(0);
  });

  test('Copy PNG puts the 1920 × 1080 image of the chart on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await openExportMenu(page, CPU_USER);

    await exportMenuItem(page, 'Copy PNG to clipboard').click();

    await expect(toastMessage(page)).toHaveText('PNG copied — paste into the postmortem');

    const copied = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const image = await createImageBitmap(await item.getType('image/png'));

      return { types: item.types, width: image.width, height: image.height };
    });

    expect(copied).toEqual({ types: ['image/png'], width: 1920, height: 1080 });
  });
});
