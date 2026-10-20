import { expect } from '@playwright/test';
import { canvasOf, resetLibrary, seedWorkspace, toast } from '../support/analyzer';
import { test } from '../support/fixtures';
import {
  addToCanvas,
  applyAbsoluteRange,
  boxOf,
  chartLibraryFilter,
  chartPanels,
  chartTitles,
  currentStatValues,
  hoverChartAt,
  referenceLabels,
  statChip,
  statisticUnits,
  statValues,
  timeframeLabel,
} from '../support/workspace';

const GAP_WINDOW = { from: '2026-08-18 06:00', to: '2026-08-18 07:00' } as const;

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('chart readouts', () => {
  test('chart header before any pointer summarises the window of each chart beside its unit', async ({ page }) => {
    await seedWorkspace(page, { name: 'Readouts', canvas: canvasOf('s3', 's5') });

    await expect(currentStatValues(page)).toHaveText(['35.8', '5.1G']);
    await expect(statisticUnits(page)).toHaveText(['%', 'B']);
    await expect(page.locator('.chart-crosshair-line')).toHaveCount(0);
  });

  test('hovering one chart draws a synchronised crosshair on every chart with the time and value under it, and leaving restores the last value', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Crosshair', canvas: canvasOf('s3', 's5') });

    await hoverChartAt(page, 0, 0.5);

    await expect(page.locator('.chart-crosshair-line')).toHaveCount(2);
    await expect(page.locator('.chart-crosshair-dot')).toHaveCount(2);
    await expect(page.locator('.chart-crosshair-tip-value')).toHaveText([/^\d+\.\d%$/, /^\d\.\d\d GiB$/]);

    await chartLibraryFilter(page).hover();

    await expect(page.locator('.chart-crosshair-line')).toHaveCount(0);
    await expect(currentStatValues(page)).toHaveText(['35.8', '5.1G']);
  });

  test('hovering a chart gives every chart a tooltip with the time and the value of the bucket under the cursor', async ({ page }) => {
    await seedWorkspace(page, { name: 'Tooltip', canvas: canvasOf('s3', 's5') });

    await hoverChartAt(page, 0, 0.4197);

    await expect(page.locator('.chart-crosshair-tip')).toHaveCount(2);
    await expect(page.locator('.chart-crosshair-tip-time')).toHaveText([/^29\/08 01:0\d$/, /^29\/08 01:0\d$/]);
    await expect(page.locator('.chart-crosshair-tip-value')).toHaveText([/^\d+\.\d%$/, /^\d\.\d\d GiB$/]);
  });

  test('tooltip sits right of the dot up to 62% of the window and flips to its left past that, so it never clips the right edge', async ({ page }) => {
    await seedWorkspace(page, { name: 'Tooltip flip', canvas: canvasOf('s3') });

    await hoverChartAt(page, 0, 0.3);
    await expect(page.locator('.chart-crosshair-tip')).toBeVisible();
    await expect(page.locator('.chart-crosshair-tip-flipped')).toHaveCount(0);
    const dotBeforeFlip = await boxOf(page.locator('.chart-crosshair-dot'));
    const tipBeforeFlip = await boxOf(page.locator('.chart-crosshair-tip'));

    expect(tipBeforeFlip.x).toBeGreaterThan(dotBeforeFlip.x + dotBeforeFlip.width);

    await hoverChartAt(page, 0, 0.8);
    await expect(page.locator('.chart-crosshair-tip-flipped')).toHaveCount(1);
    const dotPastFlip = await boxOf(page.locator('.chart-crosshair-dot'));
    const tipPastFlip = await boxOf(page.locator('.chart-crosshair-tip'));

    expect(tipPastFlip.x + tipPastFlip.width).toBeLessThan(dotPastFlip.x);
  });

  test('hovering the second chart moves the crosshair of the first chart along with it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Crosshair', canvas: canvasOf('s3', 's5') });

    await hoverChartAt(page, 1, 0.25);

    await expect(page.locator('.chart-crosshair-tip-time').first()).toHaveText(/^28\/08 2[01]:\d\d$/);
    await expect(page.locator('.chart-crosshair-line').first()).toHaveAttribute('style', /left: 2[45][.\d]*%/);
  });

  test('chart over a window that falls inside a gap in its data draws no line and its header says no data', async ({ page }) => {
    await seedWorkspace(page, { name: 'Gap', canvas: canvasOf('s3', 's5') });

    await applyAbsoluteRange(page, GAP_WINDOW.from, GAP_WINDOW.to);

    await expect(timeframeLabel(page)).toHaveText('2026-08-18 06:00 to 2026-08-18 07:00');
    await expect(currentStatValues(page)).toHaveText(['54.7']);
    await expect(page.locator('.plot-drawing-line').last()).toHaveAttribute('d', '');
    await expect(statisticUnits(page)).toHaveText(['%', 'B']);
    await expect(page.locator('.chart-panel-header-stats-empty')).toHaveText(['no data']);
  });

  test('hovering a chart inside a gap draws the crosshair without a dot, its tooltip giving the time and saying no data', async ({ page }) => {
    await seedWorkspace(page, { name: 'Gap', canvas: canvasOf('s5') });
    await applyAbsoluteRange(page, GAP_WINDOW.from, GAP_WINDOW.to);
    await expect(page.locator('.chart-panel-header-stats-empty')).toHaveText(['no data']);

    await hoverChartAt(page, 0, 0.5);

    await expect(page.locator('.chart-crosshair-line')).toHaveCount(1);
    await expect(page.locator('.chart-crosshair-dot')).toHaveCount(0);
    await expect(page.locator('.chart-crosshair-tip-time')).toHaveText(/^18\/08 06:\d\d$/);
    await expect(page.locator('.chart-crosshair-tip-gap')).toHaveText('no data');
  });

  test('chart axes scale a percent chart to 100% and a byte chart to binary units, under nine time ticks spanning the window', async ({ page }) => {
    await seedWorkspace(page, { name: 'Axes', canvas: canvasOf('s3', 's5') });

    await expect(chartPanels(page).first().locator('.chart-plot-axis-label')).toHaveText(['100.0%', '66.7%', '33.3%', '0.0%']);
    await expect(chartPanels(page).last().locator('.chart-plot-axis-label')).toHaveText(['5.69 GiB', '3.79 GiB', '1.90 GiB', '0.00 B']);
    await expect(chartPanels(page).first().locator('.chart-panel-tick')).toHaveText([
      '28/08 15:00',
      '28/08 18:00',
      '28/08 21:00',
      '29/08 00:00',
      '29/08 03:00',
      '29/08 06:00',
      '29/08 09:00',
      '29/08 12:00',
      '29/08 15:00',
    ]);
  });

  test('header statistics shorten a large reading and spell out a small one, leaving the unit to the span beside them', async ({ page }) => {
    await seedWorkspace(page, { name: 'Formats', canvas: canvasOf('s3', 's5', 's1', 's2', 's8') });

    await expect(statisticUnits(page)).toHaveText(['%', 'B', 'ms', 'n/a', 'req/s']);
    await expect(statValues(page, 'avg')).toHaveText(['42.6', '5.3G', '1.60', '852.4k', '753']);
    await expect(page.locator('.chart-panel-header-unit')).toHaveText(['%', 'B', 'ms', 'n/a', 'req/s']);
  });

  test('library thumbnails show each series unit beside its label, and nothing beside a unitless series', async ({ page }) => {
    await seedWorkspace(page, { name: 'Units', canvas: canvasOf('s3') });

    await expect(page.locator('.library-thumbnail-unit')).toHaveText(['', 'ms', '', '%', '%', 'B', 'pkt/s', 'pkt/s', 'req/s', 'ms']);
  });

  test('a stat chip clicked draws its reference line on that chart alone, and survives a reload', async ({ page }) => {
    await seedWorkspace(page, { name: 'Reference lines', canvas: canvasOf('s3', 's5') });
    const cpu = chartPanels(page).first();
    const memory = chartPanels(page).last();

    await expect(statChip(cpu, 'avg')).toHaveAttribute('title', 'show avg line');

    await statChip(cpu, 'avg').click();
    await statChip(cpu, 'max').click();

    await expect(referenceLabels(cpu)).toHaveText(['max 56.4', 'avg 42.6']);
    await expect(referenceLabels(memory)).toHaveCount(0);
    await expect(statChip(cpu, 'avg')).toHaveClass(/chart-panel-header-stat-chip-active/);
    await expect(statChip(cpu, 'avg')).toHaveAttribute('title', 'hide avg line');

    await page.reload();

    await expect(referenceLabels(chartPanels(page).first())).toHaveText(['max 56.4', 'avg 42.6']);
  });

  test('a stat chip clicked again takes its line away, leaving the others drawn', async ({ page }) => {
    await seedWorkspace(page, { name: 'Reference lines', canvas: canvasOf('s3') });
    const cpu = chartPanels(page).first();

    await statChip(cpu, 'avg').click();
    await statChip(cpu, 'min').click();
    await expect(referenceLabels(cpu)).toHaveCount(2);

    await statChip(cpu, 'avg').click();

    await expect(referenceLabels(cpu)).toHaveText(['min 22.4']);
    await expect(statChip(cpu, 'avg')).not.toHaveClass(/chart-panel-header-stat-chip-active/);
  });

  test('pressing a stat chip does not drag the chart it heads', async ({ page }) => {
    await seedWorkspace(page, { name: 'Reference lines', canvas: canvasOf('s3', 's5') });
    const cpu = chartPanels(page).first();

    await statChip(cpu, 'p95').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(referenceLabels(cpu)).toHaveText(['p95 54.2']);
  });

  test('pressing a stat chip closes the toast left up by an earlier change, as a press anywhere outside it does', async ({ page }) => {
    await seedWorkspace(page, { name: 'Reference lines', canvas: canvasOf('s3') });
    await addToCanvas(page, 'runtime_gc_pause');
    await expect(toast(page)).toHaveCount(1);
    const cpu = chartPanels(page).first();

    await statChip(cpu, 'avg').click();

    await expect(toast(page)).toHaveCount(0);
    await expect(referenceLabels(cpu)).toHaveText(['avg 42.6']);
  });
});
