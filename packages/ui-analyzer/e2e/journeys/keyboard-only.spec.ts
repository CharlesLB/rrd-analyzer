import { expect } from '@playwright/test';
import { canvasOf, openLibrary, resetLibrary, seedAnalysis } from '../support/analyzer';
import { test } from '../support/fixtures';
import { findingCards, insightBands, insightsCount, insightsPanel } from '../support/insights';
import { analysisRow } from '../support/library';
import { analysisTitleName, chartTitles, drawnLines, libraryThumbnail, timeframeLabel } from '../support/workspace';

const CPU = 'atlas_system_cpu_user';
const MEMORY = 'atlas_system_memory_used';
const LATENCY = 'atlas_http_latency_p95';
const HEAP = 'atlas_runtime_heap_objects';
const GOROUTINES = 'atlas_runtime_goroutines';
const FINDING_CHART = `${HEAP} + ${MEMORY} + ${LATENCY}`;
const CRITICAL_FRAME = '2026-08-17 23:54 to 2026-08-18 11:40';

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('journey: keyboard only', () => {
  test('a keyboard user opens an analysis, works through the findings, hides and restores them, adds a chart and takes it back, switches to the dark theme and moves on to the next analysis without touching the mouse', async ({
    page,
  }) => {
    test.slow();

    await test.step('opens the first analysis from its focused row with Enter', async () => {
      await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
      await seedAnalysis(page, { name: 'HTTP latency review', canvas: canvasOf('s9') });
      await openLibrary(page);

      await analysisRow(page, 'Atlas prod · capacity').focus();
      await page.keyboard.press('Enter');

      await expect(analysisTitleName(page)).toHaveText('Atlas prod · capacity');
      await expect(drawnLines(page)).toHaveCount(2);
    });

    await test.step('runs insights with i and walks the ranked findings with the arrow keys', async () => {
      await page.keyboard.press('i');

      await expect(insightsPanel(page)).toBeVisible();
      await expect(insightsCount(page)).toHaveText('3 findings');
      await expect(findingCards(page).nth(0)).toHaveClass(/finding-card-focused/);

      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');

      await expect(findingCards(page).nth(2)).toHaveClass(/finding-card-focused/);

      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');

      await expect(findingCards(page).nth(0)).toHaveClass(/finding-card-focused/);
    });

    await test.step('folds and unfolds the critical finding with Enter, and shows it on the charts with Space, the series it cites merged into one chart', async () => {
      await page.keyboard.press('Enter');

      await expect(page.locator('.finding-card-detail')).toHaveCount(0);

      await page.keyboard.press('Enter');

      await expect(findingCards(page).nth(0).locator('.finding-card-detail')).toBeVisible();

      await page.keyboard.press('Space');

      await expect(chartTitles(page)).toHaveText([FINDING_CHART, CPU]);
      await expect(timeframeLabel(page)).toHaveText(CRITICAL_FRAME);
      await expect(insightBands(page)).not.toHaveCount(0);
    });

    await test.step('collapses the finding and closes the panel with Escape, then hides and restores the findings with h', async () => {
      await page.keyboard.press('Escape');

      await expect(page.locator('.finding-card-detail')).toHaveCount(0);

      await page.keyboard.press('Escape');

      await expect(insightsPanel(page)).toHaveCount(0);

      await page.keyboard.press('h');

      await expect(insightBands(page)).toHaveCount(0);

      await page.keyboard.press('h');

      await expect(insightBands(page)).not.toHaveCount(0);
    });

    await test.step('adds the goroutines chart from its focused library card with Enter', async () => {
      await libraryThumbnail(page, 'runtime_goroutines').focus();
      await page.keyboard.press('Enter');

      await expect(chartTitles(page)).toHaveText([FINDING_CHART, CPU, GOROUTINES]);
      await expect(drawnLines(page)).toHaveCount(5);
    });

    await test.step('takes back the goroutines chart with Ctrl+Z, keeping the charts the finding plotted', async () => {
      await page.keyboard.press('Control+z');

      await expect(chartTitles(page)).toHaveText([FINDING_CHART, CPU]);
    });

    await test.step('opens the timeframe popover from the focused dates with Enter and leaves it with Escape, the window unchanged', async () => {
      await page.locator('.time-nav-dates').focus();
      await page.keyboard.press('Enter');

      await expect(page.locator('.timeframe-popover')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.locator('.timeframe-popover')).toHaveCount(0);
      await expect(timeframeLabel(page)).toHaveText(CRITICAL_FRAME);
    });

    await test.step('switches to the dark theme from the focused toggle', async () => {
      await page.locator('.timeframe-bar .theme-toggle').focus();
      await page.keyboard.press('Enter');

      await expect(page.locator('.app-shell')).toHaveClass(/dark/);
    });

    await test.step('goes back to the library with the focused ‹ and opens the next analysis with Space, still in the dark', async () => {
      await page.locator('.timeframe-bar-back').focus();
      await page.keyboard.press('Enter');

      await expect(page.locator('.new-analysis-card')).toBeVisible();
      await expect(page.locator('.analysis-row-meta')).toHaveText([
        '2 charts · runtime_heap_objects + system_memory_used + http_latency_p95, system_cpu_user',
        '1 chart · http_latency_p95',
      ]);

      await analysisRow(page, 'HTTP latency review').focus();
      await page.keyboard.press('Space');

      await expect(analysisTitleName(page)).toHaveText('HTTP latency review');
      await expect(chartTitles(page)).toHaveText([LATENCY]);
      await expect(page.locator('.app-shell')).toHaveClass(/dark/);
    });
  });
});
