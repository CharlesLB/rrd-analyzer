import { expect } from '@playwright/test';
import { canvasOf, resetLibrary, seedAnalysis, seedWorkspace, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import {
  chooseInsightsScope,
  editInsightRulesWhileAway,
  findingCards,
  findingTitles,
  holdInsightsRuns,
  insightBands,
  insightsCount,
  insightsPanel,
  runInsights,
} from '../support/insights';
import { analysisRow } from '../support/library';
import {
  analysisTitleName,
  backToLibrary,
  chartLibraryCount,
  chartLibraryFilter,
  chartPanels,
  chartTitles,
  choosePreset,
  libraryNames,
  timeframeLabel,
} from '../support/workspace';

const CRITICAL_FRAME = '2026-08-17 23:54 to 2026-08-18 11:40';

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
  await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
});

test.describe('insights', () => {
  test('insights trigger runs through its three stages, then opens the ranked panel with the first finding expanded', async ({ page }) => {
    await expect(page.locator('.insights-trigger-label')).toHaveText('Run insights');
    await expect(page.locator('.insights-trigger-key')).toHaveText('I');
    const releaseRun = await holdInsightsRuns(page);

    await page.locator('.insights-trigger-idle').click();

    await expect(page.locator('.insights-trigger-stage')).toHaveText(/Reading series…\s*1\/3/);
    await expect(page.locator('.insights-trigger-stage')).toHaveText(/Detecting change-points…\s*2\/3/);
    await expect(page.locator('.insights-trigger-stage')).toHaveText(/Matching rules…\s*3\/3/);
    await expect(insightsPanel(page)).toHaveCount(0);

    releaseRun();

    await expect(insightsCount(page)).toHaveText('3 findings');
    await expect(insightsPanel(page)).toBeVisible();
    await expect(page.locator('.insights-panel .side-panel-title')).toHaveText('Insights');
    await expect(page.locator('.insights-panel-count')).toHaveText('3 ranked');
    await expect(page.locator('.insights-panel-scope .option-select-trigger')).toContainText('all data');
    await expect(page.locator('.insights-panel-ran')).toHaveText(/^ran \d\d:\d\d:\d\d$/);
    await expect(page.locator('.insights-panel-unclassified')).toHaveCount(0);
    await expect(page.locator('.finding-card-severity')).toHaveText(['CRITICAL', 'WARNING', 'INFO']);
    await expect(findingTitles(page)).toHaveText(['Process likely went down out of memory', 'Sustained CPU saturation', 'p95 latency trending upward']);
    await expect(page.locator('.finding-card-interval')).toHaveText(['18/08 02:20 – 18/08 09:15', '13/08 01:50 – 13/08 09:25', '30/07 15:00 – 29/08 15:00']);
    await expect(page.locator('.finding-card-disclosure')).toHaveText(['▾ 4 evidence', '▸ 1 evidence', '▸ 1 evidence']);
    await expect(page.locator('.finding-card-match')).toHaveText([
      'evidence order matches rule',
      'partial match — single signal',
      'slow trend — informational',
    ]);
    await expect(findingCards(page).first().locator('.finding-card-inferred')).toHaveText('i');
    await expect(page.locator('.finding-card-inferred')).toHaveCount(1);
    await expect(page.locator('.finding-card-detail')).toHaveCount(1);
    await expect(findingCards(page).first().locator('.finding-card-detail')).toBeVisible();
  });

  test('a run under way is cancelled from its × or with Escape, and neither leaves findings behind', async ({ page }) => {
    const releaseRun = await holdInsightsRuns(page);

    await page.locator('.insights-trigger-idle').click();
    await page.locator('.insights-trigger-cancel').click();

    await expect(page.locator('.insights-trigger-idle')).toBeVisible();

    await page.keyboard.press('i');
    await expect(page.locator('.insights-trigger-stage')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('.insights-trigger-idle')).toBeVisible();

    releaseRun();

    await expect(insightsPanel(page)).toHaveCount(0);
    await expect(insightBands(page)).toHaveCount(0);
    await expect(toastMessage(page)).toHaveCount(0);
  });

  test('an expanded finding explains its cause with evidence chips that plot a missing series and frame their span, and Show on chart draws every series it cites on one merged chart', async ({
    page,
  }) => {
    await runInsights(page);
    const critical = findingCards(page).first();
    await expect(critical.locator('.finding-card-cause')).toHaveText(
      'Heap objects and resident memory climbed for 3.1 h — memory reached 6.18 GiB — then all reporting stopped for 3.8 h. The process was likely killed out of memory; its end is inferred from the gap, not observed.',
    );
    await expect(critical.locator('.evidence-chip-badge')).toHaveText(['heap.objects', 'memory.used', 'memory.used', 'latency.p95']);
    await expect(critical.locator('.evidence-chip-glyph')).toHaveText(['↑', '↑', '⤓', '⤓']);
    await expect(critical.locator('.evidence-chip-span-values')).toHaveText([
      '1.08M → 1.37M',
      '5.24 GiB → 6.18 GiB',
      'reset / gap · 3.8 h',
      'reset / gap · 3.8 h',
    ]);
    await expect(critical.locator('.evidence-chip-source')).toHaveText([
      'atlas_runtime_heap_objects.rrd',
      'atlas_system_memory_used.rrd',
      'atlas_system_memory_used.rrd',
      'atlas_http_latency_p95.rrd',
    ]);
    await expect(critical.locator('.evidence-chip-when')).toHaveText(['18/08 02:20 → 05:20', '18/08 02:25 → 05:20', '18/08 05:25', '18/08 05:25']);
    await expect(critical.locator('.evidence-chip-plot')).toHaveText(['plot this series', 'plot this series']);

    await critical.locator('.evidence-chip-plot').first().click();

    await expect(toastMessage(page)).toHaveText('atlas_runtime_heap_objects added to canvas');
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used', 'atlas_runtime_heap_objects']);
    await expect(critical.locator('.evidence-chip-plot')).toHaveCount(1);
    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');

    await critical.locator('.evidence-chip-values').first().click();

    await expect(timeframeLabel(page)).toHaveText('2026-08-18 00:50 to 2026-08-18 06:50');

    await critical.locator('.finding-card-show').click();

    await expect(timeframeLabel(page)).toHaveText(CRITICAL_FRAME);
    await expect(chartTitles(page)).toHaveText(['atlas_runtime_heap_objects + atlas_system_memory_used + atlas_http_latency_p95', 'atlas_system_cpu_user']);
    await expect(critical.locator('.evidence-chip-plot')).toHaveCount(0);
    await expect(critical.locator('.finding-card-detail')).toBeVisible();
  });

  test('a run goes stale when the window comes back to rules edited in the meantime, and Re-run makes it current', async ({ page }) => {
    await runInsights(page);
    await expect(insightsCount(page)).toHaveText('3 findings');

    await editInsightRulesWhileAway(page);

    await expect(page.locator('.insights-panel-stale-text')).toHaveText('Stale — the insight rules changed since this run.');
    await expect(page.locator('.insights-trigger-stale-mark')).toHaveText('↻');

    await page.locator('.insights-panel-stale-rerun').click();

    await expect(page.locator('.insights-panel-stale')).toHaveCount(0);
    await expect(insightsCount(page)).toHaveText('3 findings');
  });

  test('insights scope switched to the current viewport goes stale until Re-run analyses just that window', async ({ page }) => {
    await choosePreset(page, 'Last 7 days');
    await runInsights(page);
    await expect(insightsCount(page)).toHaveText('3 findings');

    await chooseInsightsScope(page, 'current viewport');

    await expect(page.locator('.insights-panel-scope .option-select-trigger')).toContainText('current viewport');
    await expect(page.locator('.insights-panel-stale-text')).toHaveText('Stale — the window or scope changed since this run.');
    await expect(page.locator('.insights-trigger-stale-mark')).toHaveText('↻');
    await expect(page.locator('.insights-trigger-pill')).toHaveAttribute('title', 'results are stale — open the panel to re-run');

    await page.locator('.insights-panel-stale-rerun').click();

    await expect(findingTitles(page)).toHaveText(['Sustained CPU saturation under a request burst']);
    await expect(page.locator('.finding-card-severity')).toHaveText(['WARNING']);
    await expect(page.locator('.finding-card-disclosure')).toHaveText(['▾ 2 evidence']);
    await expect(insightsCount(page)).toHaveText('1 finding');
    await expect(page.locator('.insights-panel-count')).toHaveText('1 ranked');
    await expect(page.locator('.insights-panel-stale')).toHaveCount(0);
    await expect(page.locator('.insights-trigger-stale-mark')).toHaveCount(0);

    await choosePreset(page, 'Last 24 hours');

    await expect(page.locator('.insights-panel-stale-text')).toBeVisible();

    await page.locator('.insights-panel-stale-rerun').click();

    await expect(findingTitles(page)).toHaveText(['p95 latency trending upward']);
    await expect(page.locator('.finding-card-severity')).toHaveText(['INFO']);
    await expect(page.locator('.insights-panel-stale')).toHaveCount(0);
  });

  test('insights over the current viewport of a quiet last hour report no issues and name the span analysed', async ({ page }) => {
    await choosePreset(page, 'Last 1 hour');
    await runInsights(page);
    await chooseInsightsScope(page, 'current viewport');

    await page.locator('.insights-panel-stale-rerun').click();

    await expect(insightsCount(page)).toHaveText('no findings');
    await expect(page.locator('.insights-panel-empty')).toContainText('No issues found.');
    await expect(page.locator('.insights-panel-empty')).toContainText('Analyzed the viewport — 2026-08-29 14:00 to 2026-08-29 15:00');
    await expect(findingCards(page)).toHaveCount(0);
    await expect(page.locator('.insights-panel-count')).toHaveText('');
  });

  test('keyboard runs insights with i, then i toggles the panel, arrows move focus, Enter folds, Space frames and Esc collapses before closing', async ({
    page,
  }) => {
    await page.keyboard.press('i');

    await expect(insightsPanel(page)).toBeVisible();
    await expect(findingCards(page).nth(0)).toHaveClass(/finding-card-focused/);

    await page.keyboard.press('i');

    await expect(insightsPanel(page)).toHaveCount(0);
    await expect(insightsCount(page)).toHaveText('3 findings');

    await page.keyboard.press('i');

    await expect(insightsPanel(page)).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    await expect(findingCards(page).nth(2)).toHaveClass(/finding-card-focused/);

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');

    await expect(findingCards(page).nth(0)).toHaveClass(/finding-card-focused/);
    await expect(page.locator('.finding-card-focused')).toHaveCount(1);

    await page.keyboard.press('Enter');

    await expect(page.locator('.finding-card-detail')).toHaveCount(0);

    await page.keyboard.press('Enter');

    await expect(findingCards(page).nth(0).locator('.finding-card-detail')).toBeVisible();

    await page.keyboard.press('Space');

    await expect(timeframeLabel(page)).toHaveText(CRITICAL_FRAME);

    await page.keyboard.press('Escape');

    await expect(page.locator('.finding-card-detail')).toHaveCount(0);
    await expect(insightsPanel(page)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(insightsPanel(page)).toHaveCount(0);
  });

  test('another analysis opened after a run keeps the stale count in the bar but paints none of its findings, and the pill runs insights for that analysis', async ({
    page,
  }) => {
    await seedAnalysis(page, { name: 'HTTP latency review', canvas: canvasOf('s3', 's5') });
    await choosePreset(page, 'Last 7 days');
    await runInsights(page);
    await expect(insightBands(page)).not.toHaveCount(0);

    await backToLibrary(page);
    await analysisRow(page, 'HTTP latency review').click();

    await expect(analysisTitleName(page)).toHaveText('HTTP latency review');
    await expect(insightsCount(page)).toHaveText('3 findings');
    await expect(page.locator('.insights-trigger-stale-mark')).toBeVisible();
    await expect(insightsPanel(page)).toHaveCount(0);
    await expect(insightBands(page)).toHaveCount(0);

    await page.locator('.insights-trigger-pill').click();

    await expect(insightsPanel(page)).toBeVisible();
    await expect(page.locator('.insights-trigger-stale-mark')).toHaveCount(0);
    await expect(insightBands(page)).not.toHaveCount(0);
  });

  test('hide in the insights panel takes the findings off the charts but keeps them listed, show brings them back, and h does both with the panel closed', async ({
    page,
  }) => {
    await choosePreset(page, 'Last 7 days');
    await runInsights(page);
    await expect(insightBands(page)).not.toHaveCount(0);

    await page.locator('.insights-panel-overlays').click();

    await expect(insightBands(page)).toHaveCount(0);
    await expect(findingCards(page)).not.toHaveCount(0);
    await expect(page.locator('.insights-panel-overlays')).toHaveText('show');

    await page.locator('.insights-panel-overlays').click();

    await expect(insightBands(page)).not.toHaveCount(0);

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(insightsPanel(page)).toHaveCount(0);
    await page.keyboard.press('h');

    await expect(insightBands(page)).toHaveCount(0);

    await page.keyboard.press('h');

    await expect(insightBands(page)).not.toHaveCount(0);
  });

  test('chart header squeezed by an open insights panel drops whole statistics from the left and always keeps the current reading', async ({ page }) => {
    await page.setViewportSize({ width: 924, height: 540 });
    await runInsights(page);

    const shown = chartPanels(page).first().locator('.chart-panel-header-stat-label');
    const labels = await shown.allTextContents();

    expect(labels[0]).toBe('now');
    expect(labels).toEqual(['now', 'p95', 'max', 'avg', 'min'].slice(0, labels.length));
    await expect(chartPanels(page).first().locator('.chart-panel-header-stat-value-current')).toBeVisible();
  });

  test('Enter on a focused button presses the button even while the panel lists findings, and Escape then closes the topmost layer first', async ({ page }) => {
    await runInsights(page);
    const expandedBefore = await page.locator('.finding-card-detail').count();

    await page.locator('.time-nav-dates').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('.timeframe-popover')).toBeVisible();
    await expect(page.locator('.finding-card-detail')).toHaveCount(expandedBefore);

    await page.keyboard.press('Escape');

    await expect(page.locator('.timeframe-popover')).toHaveCount(0);
    await expect(insightsPanel(page)).toBeVisible();
  });

  test('typing i into the library filter narrows the library and does not run insights', async ({ page }) => {
    await chartLibraryFilter(page).press('i');

    await expect(chartLibraryFilter(page)).toHaveValue('i');
    await expect(chartLibraryCount(page)).toHaveText('3 of 10');
    await expect(libraryNames(page)).toHaveText(['runtime_goroutines', 'runtime_gc_pause', 'runtime_heap_objects']);
    await expect(page.locator('.insights-trigger-idle')).toBeVisible();
    await expect(page.locator('.insights-trigger-running')).toHaveCount(0);
  });

  test('the finding the arrow keys move to is scrolled into view when the panel cannot show every finding at once', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.keyboard.press('i');
    await expect(findingCards(page).nth(0)).toHaveClass(/finding-card-focused/);
    await expect(findingCards(page).nth(2)).not.toBeInViewport();

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    await expect(findingCards(page).nth(2)).toHaveClass(/finding-card-focused/);
    await expect(findingCards(page).nth(2)).toBeInViewport();

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');

    await expect(findingCards(page).nth(0)).toBeInViewport();
  });
});
