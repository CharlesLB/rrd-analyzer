import { expect } from '@playwright/test';
import { canvasOf, openLibrary, resetLibrary, seedAnalysis, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import { findingTitles, insightBands, insightsCount, insightsPanel } from '../support/insights';
import { accessOnAnEarlierDay, analysisRow, analysisRowNames } from '../support/library';
import { createButton, emptyDump, nameInput, newAnalysisDialog, pickSources } from '../support/new-analysis-dialog';
import { analysisTitleName, backToLibrary, chartTitles, choosePreset, drawnLines, libraryThumbnail, timeframeLabel } from '../support/workspace';

const CAPACITY = 'Atlas prod · capacity';
const LATENCY_REVIEW = 'HTTP latency review';
const SCRATCH = 'Scratch, delete me';
const NETWORK = 'Network after the deploy';

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('journey: several analyses', () => {
  test('a team lead keeps several analyses in the library, works in the dark theme across them, carries an insights run from one to the next, starts a new one, and tidies up the library', async ({
    page,
  }) => {
    test.slow();

    await test.step('finds the library with the week’s analyses and switches to the dark theme', async () => {
      await seedAnalysis(page, { name: CAPACITY, canvas: canvasOf('s3', 's5'), accessedHoursAgo: 2.5 });
      await seedAnalysis(page, { name: LATENCY_REVIEW, canvas: canvasOf('s8', 's9'), accessedHoursAgo: 30 });
      await seedAnalysis(page, { name: SCRATCH, accessedHoursAgo: 84 });
      await openLibrary(page);

      await expect(analysisRowNames(page)).toHaveText([CAPACITY, LATENCY_REVIEW, SCRATCH]);
      await expect(page.locator('.analysis-row-access')).toHaveText(['opened 2 h ago', accessOnAnEarlierDay(30), accessOnAnEarlierDay(84)]);

      await page.locator('.theme-toggle').click();

      await expect(page.locator('.app-shell')).toHaveClass(/dark/);
    });

    await test.step('runs insights over the capacity analysis for the last week', async () => {
      await analysisRow(page, CAPACITY).click();

      await expect(analysisTitleName(page)).toHaveText(CAPACITY);
      await expect(page.locator('.app-shell')).toHaveClass(/dark/);

      await choosePreset(page, 'Last 7 days');
      await page.locator('.insights-trigger-idle').click();

      await expect(insightsPanel(page)).toBeVisible();
      await expect(insightsCount(page)).toHaveText('3 findings');
      await expect(insightBands(page)).not.toHaveCount(0);
    });

    await test.step('moves to the latency review, where the old count waits as stale and paints nothing on the new charts', async () => {
      await backToLibrary(page);
      await analysisRow(page, LATENCY_REVIEW).click();

      await expect(analysisTitleName(page)).toHaveText(LATENCY_REVIEW);
      await expect(chartTitles(page)).toHaveText(['atlas_http_requests_rate', 'atlas_http_latency_p95']);
      await expect(insightsCount(page)).toHaveText('3 findings');
      await expect(page.locator('.insights-trigger-stale-mark')).toBeVisible();
      await expect(insightsPanel(page)).toHaveCount(0);
      await expect(insightBands(page)).toHaveCount(0);
    });

    await test.step('runs insights for the latency review from the stale pill', async () => {
      await page.locator('.insights-trigger-pill').click();

      await expect(insightsPanel(page)).toBeVisible();
      await expect(page.locator('.insights-trigger-stale-mark')).toHaveCount(0);
      await expect(findingTitles(page).last()).toHaveText('p95 latency trending upward');
    });

    await test.step('starts a new analysis for the network from the library, the dark theme still on', async () => {
      await backToLibrary(page);
      await page.locator('.new-analysis-card').click();

      await expect(newAnalysisDialog(page)).toBeVisible();

      await nameInput(page).fill(NETWORK);
      await pickSources(page, [emptyDump('atlas_network.rrd', 8192)]);
      await createButton(page).click();

      await expect(analysisTitleName(page)).toHaveText(NETWORK);
      await expect(page.locator('.app-shell')).toHaveClass(/dark/);
      await expect(timeframeLabel(page)).toHaveText('Last 24 hours');

      await libraryThumbnail(page, 'system_network_packets_sent').click();
      await libraryThumbnail(page, 'system_network_packets_recv').click();

      await expect(drawnLines(page)).toHaveCount(2);
    });

    await test.step('deletes the scratch analysis it no longer needs', async () => {
      await backToLibrary(page);

      await expect(analysisRowNames(page)).toHaveText([NETWORK, LATENCY_REVIEW, CAPACITY, SCRATCH]);

      await page.locator('app-analysis-row').filter({ hasText: SCRATCH }).locator('.analysis-row-delete').click();

      await expect(toastMessage(page)).toHaveText('analysis deleted');
      await expect(analysisRowNames(page)).toHaveText([NETWORK, LATENCY_REVIEW, CAPACITY]);

      const deletion = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().includes('/api/analyses/'));
      await page.locator('.toast-close').click();
      await deletion;
    });

    await test.step('comes back after a reload to the tidied library, still in the dark, each analysis with the charts it was left with', async () => {
      await page.reload();

      await expect(page.locator('.app-shell')).toHaveClass(/dark/);
      await expect(analysisRowNames(page)).toHaveText([NETWORK, LATENCY_REVIEW, CAPACITY]);
      await expect(page.locator('.analysis-row-meta')).toHaveText([
        '2 charts · system_network_packets_sent, system_network_packets_recv',
        '2 charts · http_requests_rate, http_latency_p95',
        '2 charts · system_cpu_user, system_memory_used',
      ]);
      await expect(page.locator('.analysis-row-access')).toHaveText(['opened just now', 'opened just now', 'opened just now']);
    });
  });
});
