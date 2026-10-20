import { expect } from '@playwright/test';
import { canvasOf, resetLibrary, seedWorkspace, toast, toastMessage, waitForCanvasSave } from '../support/analyzer';
import { test } from '../support/fixtures';
import {
  backToLibrary,
  boxOf,
  chartHeader,
  chartPanel,
  chartTitles,
  contextMenuItem,
  dragOver,
  drawnLines,
  libraryThumbnail,
  onCanvasLibraryNames,
  openContextMenuOn,
  waitForChartsToSettle,
} from '../support/workspace';

const CPU = 'atlas_system_cpu_user';
const MEMORY = 'atlas_system_memory_used';
const GOROUTINES = 'atlas_runtime_goroutines';
const GC_PAUSE = 'atlas_runtime_gc_pause';
const REQUESTS = 'atlas_http_requests_rate';
const RUNTIME_MERGED = `${GOROUTINES} + ${GC_PAUSE}`;
const SYSTEM_MERGED = `${CPU} + ${MEMORY}`;
const FULL_CANVAS = [CPU, MEMORY, GOROUTINES, GC_PAUSE, REQUESTS];
const MIDDLE = 0.5;
const HAND_DRIFT_PIXELS = 8;
const HAND_DRIFT_STEPS = 4;

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('journey: changing one’s mind on the canvas', () => {
  test('an analyst fills the canvas past five charts, removes a chart by mistake, merges and separates charts, and walks the history back and forth until the canvas they keep survives a reload', async ({
    page,
  }) => {
    test.slow();

    await test.step('fills the canvas to five charts with clicks, adds a sixth that lands two by two beside the others, and takes it back with Ctrl+Z', async () => {
      await seedWorkspace(page, { name: 'Atlas prod · runtime', canvas: canvasOf('s3', 's5') });

      await libraryThumbnail(page, 'runtime_goroutines').click();
      await libraryThumbnail(page, 'runtime_gc_pause').click();
      await libraryThumbnail(page, 'http_requests_rate').click();

      await expect(chartTitles(page)).toHaveText(FULL_CANVAS);

      await libraryThumbnail(page, 'runtime_heap_objects').click();

      await expect(chartTitles(page)).toHaveText([...FULL_CANVAS, 'atlas_runtime_heap_objects']);
      await expect(page.locator('.chart-canvas')).toHaveCSS('grid-template-columns', /^\S+ \S+$/);

      await page.keyboard.press('Control+z');

      await expect(chartTitles(page)).toHaveText(FULL_CANVAS);
    });

    await test.step('takes the GC pause chart off with a hand that drifts on the ×, then wants it back with Ctrl+Z', async () => {
      const removeButton = chartPanel(page, GC_PAUSE).locator('.chart-panel-header-remove');
      await removeButton.hover();
      const button = await boxOf(removeButton);

      await page.mouse.down();
      await page.mouse.move(button.x + button.width / 2 + HAND_DRIFT_PIXELS, button.y + button.height / 2 + HAND_DRIFT_PIXELS, { steps: HAND_DRIFT_STEPS });
      await page.mouse.up();

      await expect(chartTitles(page)).toHaveText([CPU, MEMORY, GOROUTINES, REQUESTS]);

      await page.keyboard.press('Control+z');

      await expect(chartTitles(page)).toHaveText(FULL_CANVAS);
    });

    await test.step('merges the GC pause into the goroutines from the card menu, then undoes it from the toast', async () => {
      await openContextMenuOn(page, 'runtime_gc_pause');
      await contextMenuItem(page, 'Merge with runtime_goroutines').click();

      await expect(toastMessage(page)).toHaveText(`${GC_PAUSE} merged into ${GOROUTINES}`);
      await expect(chartTitles(page)).toHaveText([CPU, MEMORY, RUNTIME_MERGED, REQUESTS]);

      await toast(page).locator('.toast-action').click();

      await expect(chartTitles(page)).toHaveText(FULL_CANVAS);
    });

    await test.step('changes their mind again with Ctrl+Shift+Z, and reads the two units on an axis each', async () => {
      await page.keyboard.press('Control+Shift+Z');

      await expect(chartTitles(page)).toHaveText([CPU, MEMORY, RUNTIME_MERGED, REQUESTS]);
      await expect(chartPanel(page, RUNTIME_MERGED).locator('.chart-legend-name')).toHaveText([GOROUTINES, GC_PAUSE]);
      await expect(chartPanel(page, RUNTIME_MERGED).locator('.chart-plot-axis-value:nth-child(2)').first()).toHaveText(/ms$/);
    });

    await test.step('separates the runtime chart again from its series menu', async () => {
      await chartPanel(page, RUNTIME_MERGED).locator('.chart-panel-header-series').click();

      await expect(page.locator('app-chart-series-menu .chart-series-menu-name')).toHaveText([GOROUTINES, GC_PAUSE]);

      await page.locator('.chart-series-menu-separate').click();

      await expect(page.locator('app-chart-series-menu .anchored-menu')).toHaveCount(0);
      await expect(chartTitles(page)).toHaveText(FULL_CANVAS);
    });

    await test.step('scrolls back to the top of the canvas and merges memory into CPU by dragging its header, on a canvas already full', async () => {
      await expect(drawnLines(page)).toHaveCount(5);

      await waitForChartsToSettle(page);
      await chartHeader(page, CPU).scrollIntoViewIfNeeded();

      await dragOver(page, chartHeader(page, MEMORY), chartPanel(page, CPU), MIDDLE);

      await expect(chartPanel(page, CPU).locator('.chart-drop-indicator-merge .chart-drop-indicator-label')).toHaveText('Merge');

      await page.mouse.up();

      await expect(chartTitles(page)).toHaveText([SYSTEM_MERGED, GOROUTINES, GC_PAUSE, REQUESTS]);
      await expect(toast(page)).toHaveCount(1);
    });

    await test.step('removes the request rate, then walks the whole history back two steps and forward again', async () => {
      await chartPanel(page, REQUESTS).locator('.chart-panel-header-remove').click();

      await expect(chartTitles(page)).toHaveText([SYSTEM_MERGED, GOROUTINES, GC_PAUSE]);

      await page.keyboard.press('Control+z');

      await expect(chartTitles(page)).toHaveText([SYSTEM_MERGED, GOROUTINES, GC_PAUSE, REQUESTS]);

      await page.keyboard.press('Control+z');

      await expect(chartTitles(page)).toHaveText(FULL_CANVAS);

      await page.keyboard.press('Control+Shift+Z');
      await page.keyboard.press('Control+Shift+Z');

      await expect(chartTitles(page)).toHaveText([SYSTEM_MERGED, GOROUTINES, GC_PAUSE]);
    });

    await test.step('reloads and finds the canvas they settled on, with nothing left to undo', async () => {
      await expect(drawnLines(page)).toHaveCount(4);
      const saved = waitForCanvasSave(page);
      await libraryThumbnail(page, 'http_requests_rate').click();
      await saved;

      await expect(chartTitles(page)).toHaveText([SYSTEM_MERGED, GOROUTINES, GC_PAUSE, REQUESTS]);

      await page.reload();

      await expect(chartTitles(page)).toHaveText([SYSTEM_MERGED, GOROUTINES, GC_PAUSE, REQUESTS]);
      await expect(onCanvasLibraryNames(page)).toHaveText([
        'runtime_goroutines',
        'runtime_gc_pause',
        'system_cpu_user',
        'system_memory_used',
        'http_requests_rate',
      ]);

      await page.keyboard.press('Control+z');

      await expect(chartTitles(page)).toHaveText([SYSTEM_MERGED, GOROUTINES, GC_PAUSE, REQUESTS]);
    });

    await test.step('sees the same canvas summarised in the library row', async () => {
      await backToLibrary(page);

      await expect(page.locator('.analysis-row-meta')).toHaveText([
        '4 charts · system_cpu_user + system_memory_used, runtime_goroutines, runtime_gc_pause, http_requests_rate',
      ]);
    });
  });
});
