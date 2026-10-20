import { expect, type Locator } from '@playwright/test';
import { canvasOf, mergedChartOf, resetLibrary, seedWorkspace, toast, toastMessage, waitForCanvasSave } from '../support/analyzer';
import { test } from '../support/fixtures';
import { boxOf, chartHeader, chartPanel, chartTitles, contextMenuItem, dragOnto, dragOver, openContextMenuOn } from '../support/workspace';

const MIDDLE = 0.5;

const firstAxisLabels = (panel: Locator): Locator => panel.locator('.chart-plot-axis-value:nth-child(1)');

const secondAxisLabels = (panel: Locator): Locator => panel.locator('.chart-plot-axis-value:nth-child(2)');

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('chart merge', () => {
  test('chart dragged over the middle of a chart of another unit offers Merge, and dropped draws both in that chart’s place with an axis each', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Capacity', canvas: canvasOf('s3', 's0', 's5') });

    await dragOver(page, chartHeader(page, 'atlas_system_memory_used'), chartPanel(page, 'atlas_system_cpu_user'), MIDDLE);

    await expect(chartPanel(page, 'atlas_system_cpu_user').locator('.chart-drop-indicator-merge .chart-drop-indicator-label')).toHaveText('Merge');

    const saving = waitForCanvasSave(page);
    await page.mouse.up();
    await saving;
    const merged = chartPanel(page, 'atlas_system_cpu_user + atlas_system_memory_used');

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used', 'atlas_runtime_goroutines']);
    await expect(toastMessage(page)).toHaveText('atlas_system_memory_used merged into atlas_system_cpu_user');
    await expect(toast(page).locator('.toast-action')).toHaveText('Undo');
    await expect(merged.locator('.plot-drawing-line')).toHaveCount(2);
    await expect(firstAxisLabels(merged).first()).toHaveText('100.0%');
    await expect(secondAxisLabels(merged).first()).toHaveText(/ GiB$/);

    await page.reload();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used', 'atlas_runtime_goroutines']);
    await expect(secondAxisLabels(chartPanel(page, 'atlas_system_cpu_user + atlas_system_memory_used')).first()).toHaveText(/ GiB$/);
  });

  test('chart merged from the library’s right-click menu lands in the chart the menu named, without adding one', async ({ page }) => {
    await seedWorkspace(page, { name: 'Capacity', canvas: canvasOf('s3', 's5') });

    await openContextMenuOn(page, 'runtime_goroutines');

    const saving = waitForCanvasSave(page);
    await contextMenuItem(page, 'Merge with system_cpu_user').click();
    await saving;

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_runtime_goroutines', 'atlas_system_memory_used']);
    await expect(toastMessage(page)).toHaveText('atlas_runtime_goroutines merged into atlas_system_cpu_user');
    await expect(page.locator('.context-menu')).toHaveCount(0);

    await page.reload();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_runtime_goroutines', 'atlas_system_memory_used']);
  });

  test('two percentages merged are read against the one percentage axis', async ({ page }) => {
    await seedWorkspace(page, { name: 'CPU', canvas: canvasOf('s3', 's4') });

    await dragOnto(page, chartHeader(page, 'atlas_system_cpu_system'), chartPanel(page, 'atlas_system_cpu_user'), MIDDLE);
    const merged = chartPanel(page, 'atlas_system_cpu_user + atlas_system_cpu_system');

    await expect(merged.locator('.plot-drawing-line')).toHaveCount(2);
    await expect(firstAxisLabels(merged)).toHaveText(['100.0%', '66.7%', '33.3%', '0.0%']);
    await expect(secondAxisLabels(merged)).toHaveCount(0);
  });

  test('two millisecond series ten times apart in size keep an axis each, both reading milliseconds, rather than one flattening the other', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Latency', canvas: canvasOf('s9', 's1') });

    await dragOnto(page, chartHeader(page, 'atlas_runtime_gc_pause'), chartPanel(page, 'atlas_http_latency_p95'), MIDDLE);
    const merged = chartPanel(page, 'atlas_http_latency_p95 + atlas_runtime_gc_pause');

    await expect(firstAxisLabels(merged).first()).toHaveText(/ ms$/);
    await expect(secondAxisLabels(merged).first()).toHaveText(/ ms$/);
  });

  test('a chart dragged onto a merged chart joins it, a third series of a unit already there sharing that unit’s axis', async ({ page }) => {
    await seedWorkspace(page, { name: 'Three', canvas: [mergedChartOf('s3', ['s5', 1]), ...canvasOf('s4')] });

    await dragOnto(page, chartHeader(page, 'atlas_system_cpu_system'), chartPanel(page, 'atlas_system_cpu_user + atlas_system_memory_used'), MIDDLE);
    const merged = chartPanel(page, 'atlas_system_cpu_user + atlas_system_memory_used + atlas_system_cpu_system');

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used + atlas_system_cpu_system']);
    await expect(merged.locator('.plot-drawing-line')).toHaveCount(3);
    await expect(merged.locator('.chart-plot-axis-label').first().locator('.chart-plot-axis-value')).toHaveCount(2);
  });

  test('a merged chart dragged onto another chart brings every series it draws', async ({ page }) => {
    await seedWorkspace(page, { name: 'All of it', canvas: [mergedChartOf('s3', ['s5', 1]), ...canvasOf('s0')] });

    await dragOnto(page, chartHeader(page, 'atlas_system_cpu_user + atlas_system_memory_used'), chartPanel(page, 'atlas_runtime_goroutines'), MIDDLE);

    await expect(chartTitles(page)).toHaveText(['atlas_runtime_goroutines + atlas_system_cpu_user + atlas_system_memory_used']);
    await expect(toastMessage(page)).toHaveText('atlas_system_cpu_user + atlas_system_memory_used merged into atlas_runtime_goroutines');
  });

  test('a chart dropped away from every chart merges nothing and leaves the canvas as it was', async ({ page }) => {
    await seedWorkspace(page, { name: 'Missed', canvas: canvasOf('s3', 's5') });

    await dragOnto(page, chartHeader(page, 'atlas_system_memory_used'), page.locator('.timeline-strip'), MIDDLE);

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(page.locator('.chart-drop-indicator-merge')).toHaveCount(0);
  });

  test('a merge that would draw a sixth series in one chart is refused with a toast, and both charts stay as they were', async ({ page }) => {
    const crowded = mergedChartOf('s3', ['s4', 0], ['s5', 1], ['s0', 2], ['s2', 3]);
    await seedWorkspace(page, { name: 'Crowded', canvas: [crowded, ...canvasOf('s1')] });
    const crowdedTitle = 'atlas_system_cpu_user + atlas_system_cpu_system + atlas_system_memory_used + atlas_runtime_goroutines + atlas_runtime_heap_objects';

    await dragOnto(page, chartHeader(page, 'atlas_runtime_gc_pause'), chartPanel(page, crowdedTitle), MIDDLE);

    await expect(toastMessage(page)).toHaveText('limit of 5 series in one chart');
    await expect(chartTitles(page)).toHaveText([crowdedTitle, 'atlas_runtime_gc_pause']);
  });

  test('the series menu gives a merged series an axis of its own and takes it back, each change saved and kept after a reload', async ({ page }) => {
    await seedWorkspace(page, { name: 'CPU', canvas: [mergedChartOf('s3', ['s4', 0])] });
    const merged = chartPanel(page, 'atlas_system_cpu_user + atlas_system_cpu_system');
    const seriesMenu = page.locator('app-chart-series-menu .anchored-menu');
    const axisTrigger = (index: number): Locator => seriesMenu.locator('.option-select-trigger').nth(index);
    const axisOption = (label: string): Locator => seriesMenu.locator('.option-menu-item').filter({ hasText: label });

    await merged.locator('.chart-panel-header-series').click();

    await expect(seriesMenu.locator('.chart-series-menu-name')).toHaveText(['atlas_system_cpu_user', 'atlas_system_cpu_system']);
    await expect(seriesMenu.locator('.option-select-trigger')).toHaveText(['Axis 1▾', 'Axis 1▾']);

    const splitting = waitForCanvasSave(page);
    await axisTrigger(1).click();
    await axisOption('New axis').click();
    await splitting;

    await expect(axisTrigger(1)).toHaveText('Axis 2▾');
    await expect(secondAxisLabels(merged)).toHaveText(['100.0%', '66.7%', '33.3%', '0.0%']);

    await page.reload();
    await chartPanel(page, 'atlas_system_cpu_user + atlas_system_cpu_system').locator('.chart-panel-header-series').click();

    await expect(axisTrigger(1)).toHaveText('Axis 2▾');

    await axisTrigger(1).click();
    await axisOption('Axis 1').click();

    await expect(secondAxisLabels(chartPanel(page, 'atlas_system_cpu_user + atlas_system_cpu_system'))).toHaveCount(0);
  });

  test('separating a merged chart from its series menu puts each series back on a chart of its own where the merged chart stood', async ({ page }) => {
    await seedWorkspace(page, { name: 'Apart', canvas: [...canvasOf('s0'), mergedChartOf('s3', ['s5', 1])] });

    await chartPanel(page, 'atlas_system_cpu_user + atlas_system_memory_used').locator('.chart-panel-header-series').click();
    const saving = waitForCanvasSave(page);
    await page.locator('.chart-series-menu-separate').click();
    await saving;

    await expect(page.locator('app-chart-series-menu .anchored-menu')).toHaveCount(0);
    await expect(chartTitles(page)).toHaveText(['atlas_runtime_goroutines', 'atlas_system_cpu_user', 'atlas_system_memory_used']);
  });

  test('the series menu closes with Escape and from its backdrop, changing nothing', async ({ page }) => {
    await seedWorkspace(page, { name: 'Peek', canvas: [mergedChartOf('s3', ['s5', 1])] });
    const seriesButton = page.locator('.chart-panel-header-series');

    await seriesButton.click();
    await expect(page.locator('app-chart-series-menu .anchored-menu')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('app-chart-series-menu .anchored-menu')).toHaveCount(0);

    await seriesButton.click();
    await page.locator('app-chart-series-menu .anchored-menu-backdrop').click({ position: { x: 20, y: 20 } });

    await expect(page.locator('app-chart-series-menu .anchored-menu')).toHaveCount(0);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used']);
  });

  test('Undo on the merge toast puts both charts back where they were, and the canvas stays unmerged after a reload', async ({ page }) => {
    await seedWorkspace(page, { name: 'Oops', canvas: canvasOf('s3', 's0', 's5') });

    await dragOnto(page, chartHeader(page, 'atlas_system_memory_used'), chartPanel(page, 'atlas_system_cpu_user'), MIDDLE);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used', 'atlas_runtime_goroutines']);
    const saving = waitForCanvasSave(page);
    await toast(page).locator('.toast-action').click();
    await saving;

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_goroutines', 'atlas_system_memory_used']);

    await page.reload();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_goroutines', 'atlas_system_memory_used']);
  });

  test('the merge toast closes on its ×, and a click anywhere else closes it without undoing the merge', async ({ page }) => {
    await seedWorkspace(page, { name: 'Dismissed', canvas: canvasOf('s3', 's0', 's5') });

    await dragOnto(page, chartHeader(page, 'atlas_system_memory_used'), chartPanel(page, 'atlas_system_cpu_user'), MIDDLE);
    await expect(toastMessage(page)).toHaveText('atlas_system_memory_used merged into atlas_system_cpu_user');
    await page.getByRole('button', { name: 'dismiss', exact: true }).click();

    await expect(toast(page)).toHaveCount(0);

    await dragOnto(page, chartHeader(page, 'atlas_runtime_goroutines'), chartPanel(page, 'atlas_system_cpu_user + atlas_system_memory_used'), MIDDLE);
    await expect(toast(page)).toHaveCount(1);
    await toastMessage(page).click();

    await expect(toast(page)).toHaveCount(0);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used + atlas_runtime_goroutines']);
  });

  test('Ctrl+Z undoes a merge and Ctrl+Shift+Z merges the charts again', async ({ page }) => {
    await seedWorkspace(page, { name: 'Back and forth', canvas: canvasOf('s3', 's5') });

    await dragOnto(page, chartHeader(page, 'atlas_system_memory_used'), chartPanel(page, 'atlas_system_cpu_user'), MIDDLE);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used']);

    await page.keyboard.press('Control+z');

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);

    await page.keyboard.press('Control+Shift+Z');

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used']);
  });

  test('the series menu of a merged chart in the narrow layout opens whole inside the window, clear of its left edge', async ({ page }) => {
    await seedWorkspace(page, { name: 'Narrow', canvas: [mergedChartOf('s3', ['s5', 1])] });
    await page.setViewportSize({ width: 520, height: 800 });
    const menu = page.locator('app-chart-series-menu .anchored-menu');

    await page.locator('.chart-panel-header-series').click();
    await expect(menu).toBeVisible();
    const box = await boxOf(menu);

    expect(box.x).toBeGreaterThanOrEqual(10);
    expect(box.x + box.width).toBeLessThanOrEqual(510);
  });
});
