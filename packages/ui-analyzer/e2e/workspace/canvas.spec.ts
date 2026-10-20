import { expect } from '@playwright/test';
import {
  canvasOf,
  mergedChartOf,
  openWorkspace,
  REFERENCE_LABELS,
  resetLibrary,
  seedAnalysis,
  seedWorkspace,
  toast,
  toastMessage,
  waitForCanvasSave,
  waitForLibraryOrderSave,
} from '../support/analyzer';
import { test } from '../support/fixtures';
import {
  addToCanvas,
  analysisTitleName,
  backToLibrary,
  boxOf,
  chartLibraryCount,
  chartLibraryFilter,
  chartPanel,
  chartPanels,
  chartTitles,
  contextMenuItem,
  dragOnto,
  dragOver,
  durationAndStep,
  libraryNames,
  libraryThumbnail,
  onCanvasLibraryNames,
  openContextMenuOn,
  statisticUnits,
  timeframeLabel,
} from '../support/workspace';

const UPPER_QUARTER = 0.1;
const MIDDLE = 0.5;
const LOWER_QUARTER = 0.9;
const HAND_DRIFT_PIXELS = 10;
const HAND_DRIFT_STEPS = 5;
const FULL_CANVAS = canvasOf('s3', 's5', 's0', 's1', 's8');

const FULL_CANVAS_TITLES = [
  'atlas_system_cpu_user',
  'atlas_system_memory_used',
  'atlas_runtime_goroutines',
  'atlas_runtime_gc_pause',
  'atlas_http_requests_rate',
];

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('workspace canvas', () => {
  test('workspace opens on its saved canvas beside the whole library and the statistics of the last 24 hours', async ({ page }) => {
    const analysisId = await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    await openWorkspace(page, analysisId, 2);

    await expect(analysisTitleName(page)).toHaveText('Atlas prod · capacity');
    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
    await expect(durationAndStep(page)).toHaveAttribute('title', '24 h · step 6 min');
    await expect(chartLibraryCount(page)).toHaveText('10 of 10');
    await expect(libraryNames(page)).toHaveText(Object.values(REFERENCE_LABELS));
    await expect(onCanvasLibraryNames(page)).toHaveText(['system_cpu_user', 'system_memory_used']);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(page.locator('.chart-panel-header-unit')).toHaveText(['%', 'B']);
    await expect(statisticUnits(page)).toHaveText(['%', 'B']);
    await expect(chartPanel(page, 'atlas_system_cpu_user').locator('.chart-panel-header-stat-label')).toHaveText(['now', 'p95', 'max', 'avg', 'min']);
    await expect(chartPanel(page, 'atlas_system_cpu_user').locator('.chart-panel-header-stat-value-current')).toHaveText(/^\d+\.\d$/);
    await expect(page.locator('.library-thumbnail-active .library-thumbnail-name')).toHaveText('system_cpu_user');
  });

  test('library card clicked on a one-chart canvas adds that chart under the one already there', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await libraryThumbnail(page, 'runtime_gc_pause').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_gc_pause']);
    await expect(onCanvasLibraryNames(page)).toHaveText(['runtime_gc_pause', 'system_cpu_user']);
    await expect(page.locator('.library-thumbnail-active .library-thumbnail-name')).toHaveText('runtime_gc_pause');
  });

  test('library card clicked on a fuller canvas adds that chart after the others, while Open chart from its menu leaves it alone', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    await libraryThumbnail(page, 'http_latency_p95').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used', 'atlas_http_latency_p95']);

    await openContextMenuOn(page, 'runtime_heap_objects');
    await contextMenuItem(page, 'Open chart').click();

    await expect(chartTitles(page)).toHaveText(['atlas_runtime_heap_objects']);
    await expect(page.locator('.context-menu')).toHaveCount(0);
  });

  test('context menu on a library card adds the chart with a toast, then offers to remove it again', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    await openContextMenuOn(page, 'runtime_gc_pause');

    await expect(page.locator('.context-menu-title')).toHaveText('atlas_runtime_gc_pause');
    await expect(page.locator('.context-menu-heading')).toHaveText(['Chart', 'Merge with', 'Library']);
    await expect(page.locator('.context-menu-item')).toHaveText(['Open chart', 'Add to canvas', 'system_cpu_user', 'system_memory_used', 'Move to top']);

    await contextMenuItem(page, 'Add to canvas').click();

    await expect(toastMessage(page)).toHaveText('atlas_runtime_gc_pause added to canvas');
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used', 'atlas_runtime_gc_pause']);
    await expect(onCanvasLibraryNames(page)).toHaveText(['runtime_gc_pause', 'system_cpu_user', 'system_memory_used']);

    await openContextMenuOn(page, 'runtime_gc_pause');

    await expect(page.locator('.context-menu-item')).toHaveText(['Open chart', 'system_cpu_user', 'system_memory_used', 'Move to top', 'Remove from canvas']);

    await contextMenuItem(page, 'Remove from canvas').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(onCanvasLibraryNames(page)).toHaveText(['system_cpu_user', 'system_memory_used']);
  });

  test('context menu on a card off the canvas reads as Chart, Merge with and Library, each heading its own group of entries', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    const sections = page.locator('.context-menu-section');

    await openContextMenuOn(page, 'runtime_gc_pause');

    await expect(page.locator('.context-menu-title')).toHaveText('atlas_runtime_gc_pause');
    await expect(page.locator('.context-menu-heading')).toHaveText(['Chart', 'Merge with', 'Library']);
    await expect(sections.nth(0).locator('.context-menu-item')).toHaveText(['Open chart', 'Add to canvas']);
    await expect(sections.nth(1).locator('.context-menu-item')).toHaveText(['system_cpu_user', 'system_memory_used']);
    await expect(sections.nth(1).locator('.context-menu-item').first()).toHaveAttribute('aria-label', 'Merge with system_cpu_user');
    await expect(sections.nth(2).locator('.context-menu-item')).toHaveText(['Move to top']);
  });

  test('context menu on the only chart of the canvas has no Merge with group, and closes its Library group with Remove from canvas', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await openContextMenuOn(page, 'system_cpu_user');

    await expect(page.locator('.context-menu-heading')).toHaveText(['Chart', 'Library']);
    await expect(page.locator('.context-menu-section').first().locator('.context-menu-item')).toHaveText(['Open chart']);
    await expect(page.locator('.context-menu-section').last().locator('.context-menu-item')).toHaveText(['Move to top', 'Remove from canvas']);
    await expect(page.locator('.context-menu-section').last().locator('.context-menu-item').last()).toHaveClass(/context-menu-item-danger/);
  });

  test('context menu on a canvas of five charts adds a sixth, the canvas having no limit', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5', 's0', 's1', 's8') });

    await addToCanvas(page, 'runtime_heap_objects');

    await expect(toastMessage(page)).toHaveText('atlas_runtime_heap_objects added to canvas');
    await expect(chartTitles(page)).toHaveCount(6);
    await expect(page.locator('.context-menu')).toHaveCount(0);
  });

  test('canvas lays three charts in one column, four two by two, and nine three by three', async ({ page }) => {
    const columnsOf = async (): Promise<number> =>
      (await page.locator('.chart-canvas').evaluate((canvas) => getComputedStyle(canvas).gridTemplateColumns)).split(' ').length;

    await seedWorkspace(page, { name: 'Grid', canvas: canvasOf('s0', 's1', 's2') });

    await expect(chartTitles(page)).toHaveCount(3);
    expect(await columnsOf()).toBe(1);

    await libraryThumbnail(page, 'http_latency_p95').click();

    await expect(chartTitles(page)).toHaveCount(4);
    expect(await columnsOf()).toBe(2);

    await seedWorkspace(page, { name: 'Grid', canvas: canvasOf('s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8') });

    await expect(chartTitles(page)).toHaveCount(9);
    expect(await columnsOf()).toBe(3);
  });

  test('a chart swatch opens a palette whose Custom… mixes any color, and the color applied paints the series and survives a reload', async ({ page }) => {
    await seedWorkspace(page, { name: 'Colors', canvas: canvasOf('s3', 's5') });
    const cpuPanel = chartPanel(page, 'atlas_system_cpu_user');
    const swatch = cpuPanel.locator('.chart-panel-header .color-picker-swatch');

    await expect(swatch).toHaveAttribute('aria-label', 'change the color of atlas_system_cpu_user');

    await swatch.click();

    await expect(page.locator('.color-palette-choice')).toHaveCount(12);

    await page.locator('.color-palette-custom').click();
    await page.locator('.color-mixer-hex-input').fill('#c8402f');
    await page.locator('.color-mixer-hex-input').press('Enter');
    const saving = page.waitForResponse((response) => response.url().endsWith('/series-color') && response.request().method() === 'PUT');
    await page.locator('.color-mixer-apply').click();
    await saving;

    await expect(page.locator('app-color-palette')).toHaveCount(0);
    await expect(cpuPanel.locator('.chart-panel-header .color-swatch')).toHaveCSS('background-color', 'rgb(200, 64, 47)');
    await expect(cpuPanel.locator('.plot-drawing-line').first()).toHaveAttribute('stroke', '#c8402f');

    await page.reload();

    await expect(chartPanel(page, 'atlas_system_cpu_user').locator('.chart-panel-header .color-swatch')).toHaveCSS('background-color', 'rgb(200, 64, 47)');
  });

  test('removing every chart with × leaves the empty canvas and the statistics hint', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    await page.locator('.chart-panel-header-remove').first().click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_memory_used']);

    await page.locator('.chart-panel-header-remove').first().click();

    await expect(chartTitles(page)).toHaveCount(0);
    await expect(page.locator('.chart-canvas-empty')).toContainText('Empty canvas.');
    await expect(page.locator('.chart-canvas-empty-hint')).toHaveText('Click a chart on the left to open it. Right-click or drag to add more.');
    await expect(page.locator('.timeline-overview')).toHaveCount(0);
    await expect(onCanvasLibraryNames(page)).toHaveCount(0);
  });

  test('canvas changes are saved as they happen and come back after a reload and in the library row', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    const removal = waitForCanvasSave(page);
    await page.locator('.chart-panel-header-remove').nth(1).click();
    await removal;
    const addition = waitForCanvasSave(page);
    await addToCanvas(page, 'http_latency_p95');
    await addition;
    await page.reload();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_http_latency_p95']);

    await backToLibrary(page);

    await expect(page.locator('.analysis-row-meta')).toHaveText(['2 charts · system_cpu_user, http_latency_p95']);
  });

  test('a canvas saved with a merged chart opens it as one chart drawing both series, with a legend and an axis for each unit', async ({ page }) => {
    await seedWorkspace(page, { name: 'Merged capacity', canvas: [mergedChartOf('s3', ['s5', 1]), ...canvasOf('s0')] });
    const merged = chartPanels(page).first();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_system_memory_used', 'atlas_runtime_goroutines']);
    await expect(merged.locator('.plot-drawing-line')).toHaveCount(2);
    await expect(merged.locator('.chart-legend-name')).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(merged.locator('.chart-plot-axis-value:nth-child(1)').first()).toHaveText('100.0%');
    await expect(merged.locator('.chart-plot-axis-value:nth-child(2)').first()).toHaveText(/ GiB$/);
    await expect(onCanvasLibraryNames(page)).toHaveText(['runtime_goroutines', 'system_cpu_user', 'system_memory_used']);

    await backToLibrary(page);

    await expect(page.locator('.analysis-row-meta')).toHaveText(['2 charts · system_cpu_user + system_memory_used, runtime_goroutines']);
  });

  test('library card clicked while its chart is already on the canvas leaves the canvas as it is and makes that chart the active one', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await expect(page.locator('.library-thumbnail-active .library-thumbnail-name')).toHaveText('system_cpu_user');

    await libraryThumbnail(page, 'system_memory_used').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(page.locator('.library-thumbnail-active .library-thumbnail-name')).toHaveText('system_memory_used');
  });

  test('library card clicked on an empty canvas opens that chart', async ({ page }) => {
    await seedWorkspace(page, { name: 'Untitled analysis' });

    await libraryThumbnail(page, 'runtime_gc_pause').click();

    await expect(chartTitles(page)).toHaveText(['atlas_runtime_gc_pause']);
    await expect(page.locator('.chart-canvas-empty')).toHaveCount(0);
  });

  test('library card clicked on a canvas of five charts goes after them, and no chart is replaced', async ({ page }) => {
    await seedWorkspace(page, { name: 'Full house', canvas: FULL_CANVAS });

    await libraryThumbnail(page, 'http_latency_p95').click();

    await expect(chartTitles(page)).toHaveText([...FULL_CANVAS_TITLES, 'atlas_http_latency_p95']);
  });

  test('remove button pressed by a hand that drifts a few pixels still takes the chart off instead of dragging it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    const removeButton = chartPanel(page, 'atlas_system_cpu_user').locator('.chart-panel-header-remove');
    await removeButton.hover();
    const button = await boxOf(removeButton);

    await page.mouse.down();
    await page.mouse.move(button.x + button.width / 2 - HAND_DRIFT_PIXELS, button.y + button.height / 2, { steps: HAND_DRIFT_STEPS });
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: HAND_DRIFT_STEPS });
    await page.mouse.up();

    await expect(chartTitles(page)).toHaveText(['atlas_system_memory_used']);
  });

  test('removing the active chart hands the active mark to the first chart left, while removing another chart keeps it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Active marks', canvas: canvasOf('s3', 's5', 's0') });
    await libraryThumbnail(page, 'runtime_goroutines').click();
    await expect(page.locator('.library-thumbnail-active .library-thumbnail-name')).toHaveText('runtime_goroutines');

    await chartPanel(page, 'atlas_system_cpu_user').locator('.chart-panel-header-remove').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_memory_used', 'atlas_runtime_goroutines']);
    await expect(page.locator('.library-thumbnail-active .library-thumbnail-name')).toHaveText('runtime_goroutines');

    await chartPanel(page, 'atlas_runtime_goroutines').locator('.chart-panel-header-remove').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_memory_used']);
    await expect(page.locator('.library-thumbnail-active .library-thumbnail-name')).toHaveText('system_memory_used');
  });

  test('context menu Open chart on a chart already on the canvas leaves that chart alone on the canvas', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    await openContextMenuOn(page, 'system_memory_used');
    await expect(page.locator('.context-menu-title')).toHaveText('atlas_system_memory_used');
    await contextMenuItem(page, 'Open chart').click();

    await expect(chartTitles(page)).toHaveText(['atlas_system_memory_used']);
    await expect(onCanvasLibraryNames(page)).toHaveText(['system_memory_used']);
  });

  test('context menu Move to top lifts a chart to the head of the library, and the analysis reopens with the library in that order', async ({ page }) => {
    const analysisId = await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const arranged = [REFERENCE_LABELS.s9, ...Object.values(REFERENCE_LABELS).filter((label) => label !== REFERENCE_LABELS.s9)];
    const saved = waitForLibraryOrderSave(page);

    await openContextMenuOn(page, REFERENCE_LABELS.s9);
    await contextMenuItem(page, 'Move to top').click();

    await expect(libraryNames(page)).toHaveText(arranged);
    await expect(page.locator('.context-menu')).toHaveCount(0);
    await saved;

    await openWorkspace(page, analysisId, 1);

    await expect(libraryNames(page)).toHaveText(arranged);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);
  });

  test('context menu on the chart already heading the library offers Move to top disabled', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await openContextMenuOn(page, REFERENCE_LABELS.s0);

    await expect(contextMenuItem(page, 'Move to top')).toBeDisabled();
  });

  test('context menu closes without changing the canvas when its backdrop is clicked or right-clicked', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await openContextMenuOn(page, 'runtime_gc_pause');
    await page.locator('.context-menu-backdrop').click({ position: { x: 900, y: 120 } });

    await expect(page.locator('.context-menu')).toHaveCount(0);

    await openContextMenuOn(page, 'runtime_gc_pause');
    await page.locator('.context-menu-backdrop').click({ button: 'right', position: { x: 900, y: 120 } });

    await expect(page.locator('.context-menu')).toHaveCount(0);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);
  });

  test('context menu opened on a card low in the window is lifted so that it stays inside the window', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const lowestCard = libraryThumbnail(page, 'http_latency_p95');
    await lowestCard.scrollIntoViewIfNeeded();
    const card = await boxOf(lowestCard);

    await lowestCard.click({ button: 'right', position: { x: 30, y: card.height - 12 } });

    const menu = await boxOf(page.locator('.context-menu'));
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(menu.y + menu.height).toBeLessThanOrEqual(viewport?.height ?? 0);
    expect(menu.y).toBeLessThan(card.y + card.height - 12);
  });

  test('library card given the focus adds its chart on Enter, as a click would', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const card = libraryThumbnail(page, 'runtime_gc_pause');

    await expect(card).toHaveAttribute('role', 'button');

    await card.press('Enter');

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_gc_pause']);
  });

  test('library card dragged onto the upper quarter of a chart is inserted before that chart', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await dragOver(page, libraryThumbnail(page, 'runtime_gc_pause'), chartPanels(page).first(), UPPER_QUARTER);

    await expect(page.locator('.chart-drop-indicator-before')).toBeVisible();

    await page.mouse.up();

    await expect(chartTitles(page)).toHaveText(['atlas_runtime_gc_pause', 'atlas_system_cpu_user']);
    await expect(page.locator('.chart-drop-indicator-before')).toHaveCount(0);
  });

  test('library card dragged onto the middle of a chart offers Merge, and dropped joins that chart without adding one', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    await dragOver(page, libraryThumbnail(page, 'runtime_gc_pause'), chartPanel(page, 'atlas_system_cpu_user'), MIDDLE);

    await expect(chartPanel(page, 'atlas_system_cpu_user').locator('.chart-drop-indicator-merge .chart-drop-indicator-label')).toHaveText('Merge');

    await page.mouse.up();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user + atlas_runtime_gc_pause', 'atlas_system_memory_used']);
    await expect(toastMessage(page)).toHaveText('atlas_runtime_gc_pause merged into atlas_system_cpu_user');
    await expect(page.locator('.chart-drop-indicator-merge')).toHaveCount(0);
  });

  test('library card dragged onto the edge of a chart on a canvas of five charts is placed after it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Full house', canvas: FULL_CANVAS });

    await dragOnto(page, libraryThumbnail(page, 'runtime_heap_objects'), chartPanels(page).first(), LOWER_QUARTER);

    await expect(chartTitles(page)).toHaveText([...FULL_CANVAS_TITLES.slice(0, 1), 'atlas_runtime_heap_objects', ...FULL_CANVAS_TITLES.slice(1)]);
  });

  test('library card dragged onto the empty canvas becomes its only chart', async ({ page }) => {
    await seedWorkspace(page, { name: 'Untitled analysis' });

    await dragOnto(page, libraryThumbnail(page, 'runtime_heap_objects'), page.locator('.chart-canvas-empty'), MIDDLE);

    await expect(chartTitles(page)).toHaveText(['atlas_runtime_heap_objects']);
  });

  test('library card held over the space left below a shortened chart shows where it will go, and is added there', async ({ page }) => {
    await seedWorkspace(page, { name: 'Room below', canvas: canvasOf('s3') });
    const resizeHandle = page.locator('.chart-panel-resize');
    await expect(page.locator('.plot-drawing-line')).toHaveCount(1);
    await resizeHandle.hover();
    const handle = await boxOf(resizeHandle);
    const handleCentreX = handle.x + handle.width / 2;
    const handleCentreY = handle.y + handle.height / 2;

    await page.mouse.down();
    await page.mouse.move(handleCentreX, handleCentreY - 300, { steps: 10 });
    await page.mouse.up();

    expect((await boxOf(resizeHandle)).y).toBeLessThan(handle.y - 200);

    await dragOver(page, libraryThumbnail(page, 'runtime_heap_objects'), page.locator('.chart-canvas'), LOWER_QUARTER);

    await expect(page.locator('.chart-canvas-slot')).toHaveText('Add here');

    await page.mouse.up();

    await expect(page.locator('.chart-canvas-slot')).toHaveCount(0);
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_heap_objects']);
  });

  test('library card dragged over a chart and on past it takes the drop marker away before the drop', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await dragOver(page, libraryThumbnail(page, 'runtime_gc_pause'), chartPanels(page).first(), UPPER_QUARTER);

    await expect(page.locator('.chart-drop-indicator-before')).toBeVisible();

    const strip = await boxOf(page.locator('.timeline-strip'));
    await page.mouse.move(strip.x + strip.width / 2, strip.y + strip.height / 2, { steps: 8 });

    await expect(page.locator('.chart-drop-indicator-before, .chart-drop-indicator-after')).toHaveCount(0);

    await page.mouse.up();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);
  });

  test('library card dropped away from every chart leaves the canvas as it was', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await dragOnto(page, libraryThumbnail(page, 'runtime_gc_pause'), page.locator('.timeline-strip'), MIDDLE);

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);
    await expect(page.locator('.chart-drop-indicator-before, .chart-drop-indicator-after')).toHaveCount(0);
  });

  test('chart header dragged onto the upper quarter of the first chart of five moves it to the front, and the order is saved', async ({ page }) => {
    await seedWorkspace(page, { name: 'Full house', canvas: FULL_CANVAS });
    const saving = waitForCanvasSave(page);

    await dragOnto(
      page,
      chartPanel(page, 'atlas_system_memory_used').locator('.chart-panel-header-title'),
      chartPanel(page, 'atlas_system_cpu_user'),
      UPPER_QUARTER,
    );
    await saving;

    await expect(chartTitles(page)).toHaveText(['atlas_system_memory_used', 'atlas_system_cpu_user', ...FULL_CANVAS_TITLES.slice(2)]);
    await expect(toast(page)).toHaveCount(0);

    await backToLibrary(page);

    await expect(page.locator('.analysis-row-meta')).toHaveText([
      '5 charts · system_memory_used, system_cpu_user, runtime_goroutines, runtime_gc_pause, http_requests_rate',
    ]);
  });

  test('chart header dragged onto the middle of another chart merges into it, in its place', async ({ page }) => {
    await seedWorkspace(page, { name: 'Merge', canvas: canvasOf('s3', 's5', 's0') });

    await dragOnto(page, chartPanel(page, 'atlas_system_cpu_user').locator('.chart-panel-header-title'), chartPanel(page, 'atlas_runtime_goroutines'), MIDDLE);

    await expect(chartTitles(page)).toHaveText(['atlas_system_memory_used', 'atlas_runtime_goroutines + atlas_system_cpu_user']);
  });

  test('chart header dragged over the middle of its own chart offers no merge and changes nothing when dropped', async ({ page }) => {
    await seedWorkspace(page, { name: 'Stay put', canvas: canvasOf('s3', 's5') });
    const cpuPanel = chartPanel(page, 'atlas_system_cpu_user');

    await dragOver(page, cpuPanel.locator('.chart-panel-header-title'), cpuPanel, MIDDLE);

    await expect(page.locator('.chart-drop-indicator-merge')).toHaveCount(0);

    await page.mouse.up();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
  });

  test('chart header dropped back on its own header, a change of mind, leaves the chart where it was', async ({ page }) => {
    await seedWorkspace(page, { name: 'Changed my mind', canvas: canvasOf('s3', 's5') });
    const cpuPanel = chartPanel(page, 'atlas_system_cpu_user');

    await dragOver(page, cpuPanel.locator('.chart-panel-header-title'), cpuPanel, UPPER_QUARTER);

    await expect(page.locator('.chart-drop-indicator-before, .chart-drop-indicator-after')).toHaveCount(0);

    await page.mouse.up();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
  });

  test('library filter matches the full series name whatever its case and ignores surrounding spaces', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await chartLibraryFilter(page).fill('  CPU  ');

    await expect(chartLibraryCount(page)).toHaveText('2 of 10');
    await expect(libraryNames(page)).toHaveText(['system_cpu_user', 'system_cpu_system']);

    await chartLibraryFilter(page).fill('atlas');

    await expect(chartLibraryCount(page)).toHaveText('10 of 10');
  });

  test('library filter matching nothing says No charts match, and clearing it brings every chart back', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await chartLibraryFilter(page).fill('disk_latency');

    await expect(chartLibraryCount(page)).toHaveText('0 of 10');
    await expect(page.locator('.chart-library-empty')).toHaveText('No charts match.');
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);

    await chartLibraryFilter(page).fill('');

    await expect(chartLibraryCount(page)).toHaveText('10 of 10');
    await expect(page.locator('.chart-library-empty')).toHaveCount(0);
  });

  test('library collapsed with « leaves only the » rail, and expanding it again keeps the filter typed before', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await chartLibraryFilter(page).fill('runtime');

    await page.getByTitle('collapse library').click();

    await expect(page.locator('.chart-library-rail')).toBeVisible();
    await expect(page.locator('.library-thumbnail')).toHaveCount(0);

    await page.getByTitle('expand library').click();

    await expect(chartLibraryFilter(page)).toHaveValue('runtime');
    await expect(chartLibraryCount(page)).toHaveText('3 of 10');
  });

  test('canvas saved with a series its sources no longer hold opens on the charts it can still draw', async ({ page }) => {
    const analysisId = await seedAnalysis(page, {
      name: 'Retired series',
      canvas: [...canvasOf('s3'), { seriesId: 's42', label: 'retired_series' }, ...canvasOf('s5')],
    });

    await openWorkspace(page, analysisId, 2);

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(onCanvasLibraryNames(page)).toHaveText(['system_cpu_user', 'system_memory_used']);
  });

  test('canvas of three charts, or four two by two, fills the height without scrolling, while a seventh chart makes it scroll', async ({ page }) => {
    await seedWorkspace(page, { name: 'Tall canvas', canvas: canvasOf('s3', 's5', 's0') });

    await expect(page.locator('.chart-canvas')).toHaveCSS('overflow-y', 'hidden');

    await addToCanvas(page, 'runtime_gc_pause');

    await expect(chartTitles(page)).toHaveCount(4);
    await expect(page.locator('.chart-canvas')).toHaveCSS('overflow-y', 'hidden');

    await addToCanvas(page, 'http_requests_rate');
    await addToCanvas(page, 'runtime_heap_objects');
    await addToCanvas(page, 'http_latency_p95');

    await expect(chartTitles(page)).toHaveCount(7);
    await expect(page.locator('.chart-canvas')).toHaveCSS('overflow-y', 'auto');
  });

  test('library card dragged onto the lower quarter of a chart is inserted after that chart', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const source = await boxOf(libraryThumbnail(page, 'runtime_gc_pause'));
    const target = await boxOf(chartPanels(page).first());

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 40, source.y + source.height / 2 + 20, { steps: 4 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.9, { steps: 12 });

    await expect(page.locator('.chart-drop-indicator-after')).toBeVisible();

    await page.mouse.up();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_gc_pause']);
    await expect(page.locator('.chart-drop-indicator-after')).toHaveCount(0);
  });
});
