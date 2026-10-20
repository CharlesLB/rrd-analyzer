import { expect } from '@playwright/test';
import { REFERENCE_FILES, resetLibrary, toastMessage } from '../support/analyzer';
import { downloadedBytes, downloadFrom } from '../support/downloads';
import { test } from '../support/fixtures';
import { findingCards, findingTitles, insightBands, insightsCount, insightsPanel } from '../support/insights';
import { analysisRow, analysisRowNames } from '../support/library';
import { createButton, emptyDump, nameInput, openNewAnalysisDialog, pickSources, readinessHint, sourceNames } from '../support/new-analysis-dialog';
import {
  analysisTitleName,
  backToLibrary,
  chartLibraryCount,
  chartLibraryFilter,
  chartPanel,
  chartTitles,
  choosePreset,
  drawnLines,
  exportMenuItem,
  libraryThumbnail,
  openExportMenu,
  timeframeLabel,
} from '../support/workspace';

const ANALYSIS_NAME = 'Atlas prod · incident of 18 August';
const MEMORY = 'atlas_system_memory_used';
const CPU = 'atlas_system_cpu_user';
const HEAP = 'atlas_runtime_heap_objects';
const LATENCY = 'atlas_http_latency_p95';
const MERGED = `${HEAP} + ${MEMORY} + ${LATENCY}`;
const CRITICAL_FRAME = '2026-08-17 23:54 to 2026-08-18 11:40';
const _MIDDLE = 0.5;
const COLLECTOR_FILES = REFERENCE_FILES.map((file) => emptyDump(file.name, file.size));

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('journey: investigating an incident', () => {
  test('an on-call engineer builds an analysis from the collector files, shows the out-of-memory finding on the charts with the series it cites, and leaves the merged chart of the finding and its CSV for the postmortem', async ({
    page,
  }) => {
    test.slow();

    await test.step('creates the analysis from the files the collector writes, one per metric, after first picking a stray backup', async () => {
      await openNewAnalysisDialog(page);
      await nameInput(page).fill(ANALYSIS_NAME);
      await pickSources(page, [emptyDump('atlas_backup_2025.rrd', 1024)]);
      await page.locator('.pending-source-list-row-remove').click();
      await pickSources(page, COLLECTOR_FILES);

      await expect(sourceNames(page)).toHaveText(COLLECTOR_FILES.map((file) => file.name));
      await expect(readinessHint(page)).toHaveText('10 sources ready');

      await createButton(page).click();

      await expect(analysisTitleName(page)).toHaveText(ANALYSIS_NAME);
      await expect(chartLibraryCount(page)).toHaveText('10 of 10');
      await expect(page.locator('.chart-canvas-empty')).toContainText('Empty canvas.');
    });

    await test.step('finds the memory chart through the library filter, then adds the CPU chart under it', async () => {
      await chartLibraryFilter(page).fill('memory');

      await expect(chartLibraryCount(page)).toHaveText('1 of 10');

      await libraryThumbnail(page, 'system_memory_used').click();

      await expect(chartTitles(page)).toHaveText([MEMORY]);

      await chartLibraryFilter(page).fill('');
      await libraryThumbnail(page, 'system_cpu_user').click();

      await expect(chartTitles(page)).toHaveText([MEMORY, CPU]);
      await expect(drawnLines(page)).toHaveCount(2);
    });

    await test.step('widens the window to the last week and runs insights with the i key', async () => {
      await choosePreset(page, 'Last 7 days');
      await page.keyboard.press('i');

      await expect(insightsPanel(page)).toBeVisible();
      await expect(insightsCount(page)).toHaveText('3 findings');
      await expect(findingTitles(page)).toHaveText(['Process likely went down out of memory', 'Sustained CPU saturation', 'p95 latency trending upward']);
      await expect(findingCards(page).first().locator('.finding-card-detail')).toBeVisible();
    });

    await test.step('shows the critical finding on the charts, which draws the heap, memory and latency series it cites on one merged chart and frames it', async () => {
      const critical = findingCards(page).first();

      await expect(critical.locator('.evidence-chip-plot')).toHaveText(['plot this series', 'plot this series']);

      await critical.locator('.finding-card-show').click();

      await expect(chartTitles(page)).toHaveText([MERGED, CPU]);
      await expect(critical.locator('.evidence-chip-plot')).toHaveCount(0);
      await expect(timeframeLabel(page)).toHaveText(CRITICAL_FRAME);
      await expect(insightBands(page)).not.toHaveCount(0);
    });

    await test.step('closes the panel and reads the series of the finding together on its merged chart', async () => {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      await expect(insightsPanel(page)).toHaveCount(0);
      await expect(chartPanel(page, MERGED).locator('.chart-legend-name')).toHaveText([HEAP, MEMORY, LATENCY]);
      await expect(chartPanel(page, MERGED).locator('.plot-drawing-line')).toHaveCount(3);
    });

    await test.step('exports the samples of the merged chart over the framed window as CSV', async () => {
      await openExportMenu(page, MERGED);

      await expect(page.locator('.export-menu-scope-label')).toContainText('findings shaded');
      await expect(exportMenuItem(page, 'CSV data')).toContainText('raw samples for its 3 series');

      const download = await downloadFrom(page, async () => await exportMenuItem(page, 'CSV data').click());
      const [header] = (await downloadedBytes(download)).toString('utf8').split('\n');

      expect(download.suggestedFilename()).toMatch(/_202608172354_202608181140\.csv$/);
      expect(header).toContain('system_memory_used');
      expect(header).toContain('runtime_heap_objects');
      expect(header).toContain('http_latency_p95');
      await expect(toastMessage(page)).toHaveText(/^CSV exported · \d+ samples/);
    });

    await test.step('goes back to the library, which lists the analysis as it was left', async () => {
      await backToLibrary(page);

      await expect(analysisRowNames(page)).toHaveText([ANALYSIS_NAME]);
      await expect(page.locator('.analysis-row-meta')).toHaveText(['2 charts · runtime_heap_objects + system_memory_used + http_latency_p95, system_cpu_user']);
      await expect(page.locator('.analysis-row-access')).toHaveText(['opened just now']);
    });

    await test.step('reopens it the next morning and finds the merged chart waiting', async () => {
      await analysisRow(page, ANALYSIS_NAME).click();

      await expect(analysisTitleName(page)).toHaveText(ANALYSIS_NAME);
      await expect(chartTitles(page)).toHaveText([MERGED, CPU]);
      await expect(drawnLines(page)).toHaveCount(4);
    });
  });
});
