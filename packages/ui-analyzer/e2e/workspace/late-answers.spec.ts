import { type APIResponse, expect, type Page, type Response, type Route } from '@playwright/test';
import {
  CHART_QUERY_PATH,
  canvasOf,
  holdAnswers,
  isChartQuery,
  openLibrary,
  recordChartQueries,
  resetLibrary,
  seedAnalysis,
  seedWorkspace,
  waitForCanvasSave,
} from '../support/analyzer';
import { daemonAddressed } from '../support/daemon';
import { test } from '../support/fixtures';
import { analysisRows } from '../support/library';
import { addToCanvas, backToLibrary, chartTitles, drawnLines } from '../support/workspace';

const BUNDLE_PATH_SUFFIX = '/bundle';

type HeldAnswer = {
  readonly route: Route;
  readonly answer: APIResponse;
};

const isBundle = (response: Response): boolean => response.url().endsWith(BUNDLE_PATH_SUFFIX);

const holdChartQueries = async (page: Page): Promise<HeldAnswer[]> => {
  const held: HeldAnswer[] = [];

  await page.route(`**${CHART_QUERY_PATH}`, async (route) => {
    if (!isChartQuery(route.request())) {
      await route.fallback();

      return;
    }

    held.push({ route, answer: await route.fetch({ url: daemonAddressed(route.request().url()) }) });
  });

  return held;
};

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('workspace answered late', () => {
  test('the analysis on screen reopened from the library keeps a chart added while it was being read again', async ({ page }) => {
    await seedAnalysis(page, { name: 'Edited meanwhile', canvas: canvasOf('s3') });
    await openLibrary(page);
    await analysisRows(page).click();
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);
    await backToLibrary(page);
    const releaseBundle = await holdAnswers(page, `**/api/analyses/*${BUNDLE_PATH_SUFFIX}`, 'GET');

    await analysisRows(page).click();
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);
    const saving = waitForCanvasSave(page);
    await addToCanvas(page, 'runtime_gc_pause');
    await saving;
    const staleBundle = page.waitForResponse(isBundle);
    releaseBundle();
    await staleBundle;

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_gc_pause']);

    await page.reload();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_gc_pause']);
  });

  test('two charts added while the first is still loading keep both their lines, so undoing and redoing the second asks for nothing again', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Two at once', canvas: canvasOf('s3') });
    const held = await holdChartQueries(page);

    await addToCanvas(page, 'runtime_gc_pause');
    await addToCanvas(page, 'runtime_heap_objects');
    await expect.poll(() => held.length).toBe(2);
    const [first, second] = held;
    await second.route.fulfill({ response: second.answer });
    await first.route.fulfill({ response: first.answer });
    await page.unroute(`**${CHART_QUERY_PATH}`);

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_gc_pause', 'atlas_runtime_heap_objects']);
    await expect(drawnLines(page)).toHaveCount(3);

    const laterQueries = recordChartQueries(page);

    await page.keyboard.press('Control+z');
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_runtime_gc_pause']);
    await page.keyboard.press('Control+Shift+Z');

    await expect(drawnLines(page)).toHaveCount(3);
    laterQueries.stop();
    expect(laterQueries.requests).toHaveLength(0);
  });
});
