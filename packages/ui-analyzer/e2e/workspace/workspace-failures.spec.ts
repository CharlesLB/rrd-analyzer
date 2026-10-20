import { expect } from '@playwright/test';
import { canvasOf, failRequests, goToWorkspace, REFERENCE_FILES, resetLibrary, seedAnalysis, seedWorkspace, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import {
  BROKEN_SOURCES,
  MISSING_SOURCE,
  RRD_FIXTURES,
  restorableSourceOf,
  sourcesNamed,
  type WrittenSource,
  writeBrokenSources,
  writeRrdFixtures,
} from '../support/rrd-fixtures';
import {
  analysisTitleName,
  analysisUnavailableHint,
  analysisUnavailableSources,
  analysisUnavailableTitle,
  backToLibrary,
  chartLibraryCount,
  chartTitles,
  choosePreset,
  drawnLines,
  durationAndStep,
  timeframeLabel,
} from '../support/workspace';

const ANALYSIS_UNAVAILABLE = 'This analysis could not be opened.';
const SOURCES_UNEXPLAINED = 'Its RRD files may have been changed or become unreadable since the analysis was created.';
const ONE_SOURCE_MISSING = '1 RRD file it reads is no longer where it was:';
const SERIES_UNAVAILABLE = 'Could not read the series for this window';

const dumps: { written: readonly WrittenSource[]; broken: readonly WrittenSource[] } = { written: [], broken: [] };

test.beforeAll(() => {
  dumps.written = writeRrdFixtures();
  dumps.broken = writeBrokenSources();
});

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('workspace failures', () => {
  test('workspace for an analysis id the library does not know says it could not be opened, in place of an empty library and canvas', async ({ page }) => {
    await goToWorkspace(page, 'feedfacecafebeef');

    await expect(analysisUnavailableTitle(page)).toHaveText(ANALYSIS_UNAVAILABLE);
    await expect(analysisUnavailableHint(page)).toHaveText(SOURCES_UNEXPLAINED);
    await expect(analysisUnavailableSources(page)).toHaveCount(0);
    await expect(page.locator('.chart-library')).toHaveCount(0);
    await expect(page.locator('.chart-canvas-empty')).toHaveCount(0);
    await expect(page.locator('.timeline-overview')).toHaveCount(0);
    await expect(analysisTitleName(page)).toHaveText('');
    await expect(toastMessage(page)).toHaveCount(0);
  });

  test('workspace that could not be opened shows no timeframe dated at the 1970 epoch', async ({ page }) => {
    await goToWorkspace(page, 'feedfacecafebeef');
    await expect(analysisUnavailableTitle(page)).toHaveText(ANALYSIS_UNAVAILABLE);

    await expect(timeframeLabel(page)).not.toContainText('1969', { timeout: 3000 });
    await expect(durationAndStep(page)).toHaveAttribute('title', 'pick dates', { timeout: 3000 });
  });

  test('workspace that could not be opened still leads back to the library with ‹', async ({ page }) => {
    await goToWorkspace(page, 'feedfacecafebeef');
    await expect(analysisUnavailableTitle(page)).toHaveText(ANALYSIS_UNAVAILABLE);

    await backToLibrary(page);

    await expect(page).toHaveURL('/#/');
    await expect(page.locator('.new-analysis-card')).toBeVisible();
  });

  test('workspace that could not be opened leads back to the library from the notice as well', async ({ page }) => {
    await goToWorkspace(page, 'feedfacecafebeef');

    await page.locator('.analysis-unavailable-back').click();

    await expect(page).toHaveURL('/#/');
    await expect(page.locator('.new-analysis-card')).toBeVisible();
  });

  test('workspace whose source file was deleted after the analysis was created names the file that is gone', async ({ page }) => {
    const analysisId = await seedAnalysis(page, { name: 'Deleted source', files: [MISSING_SOURCE], canvas: [{ seriesId: 's0', label: 'deleted_since' }] });

    await goToWorkspace(page, analysisId);

    await expect(analysisUnavailableTitle(page)).toHaveText(ANALYSIS_UNAVAILABLE);
    await expect(page.locator('.analysis-unavailable-summary')).toHaveText(ONE_SOURCE_MISSING);
    await expect(analysisUnavailableSources(page)).toHaveText([MISSING_SOURCE.path]);
    await expect(chartTitles(page)).toHaveCount(0);
  });

  test('workspace whose deleted source file is put back opens when the opening is tried again', async ({ page }) => {
    const [readable] = sourcesNamed(dumps.written, [RRD_FIXTURES[0].fileName]);
    const restored = restorableSourceOf(readable);
    const analysisId = await seedAnalysis(page, { name: 'Put back', files: [restored.source] });
    await goToWorkspace(page, analysisId);
    await expect(analysisUnavailableSources(page)).toHaveText([restored.source.path]);

    restored.restore();
    await page.locator('.analysis-unavailable-retry').click();

    await expect(analysisUnavailableTitle(page)).toHaveCount(0);
    await expect(analysisTitleName(page)).toHaveText('Put back');
    await expect(chartLibraryCount(page)).not.toHaveText('0 of 0');
  });

  test('workspace with one readable dump and one deleted since opens neither and names only the one that is gone', async ({ page }) => {
    const [readable] = sourcesNamed(dumps.written, [RRD_FIXTURES[0].fileName]);
    const analysisId = await seedAnalysis(page, { name: 'Half gone', files: [readable, MISSING_SOURCE] });

    await goToWorkspace(page, analysisId);

    await expect(analysisUnavailableSources(page)).toHaveText([MISSING_SOURCE.path]);
    await expect(page.locator('.chart-library')).toHaveCount(0);
  });

  test('workspace mixing a dump read off disk with a source picked in a browser, which has no path, says it could not be opened and calls no file missing', async ({
    page,
  }) => {
    const [readable] = sourcesNamed(dumps.written, [RRD_FIXTURES[0].fileName]);
    const analysisId = await seedAnalysis(page, { name: 'Located and not', files: [readable, REFERENCE_FILES[0]] });

    await goToWorkspace(page, analysisId);

    await expect(analysisUnavailableTitle(page)).toHaveText(ANALYSIS_UNAVAILABLE);
    await expect(analysisUnavailableSources(page)).toHaveCount(0);
  });

  Object.entries(BROKEN_SOURCES).forEach(([kind, broken]) => {
    test(`workspace over a broken source (${kind.toLowerCase().replaceAll('_', ' ')}) says it could not be opened and calls no file missing`, async ({
      page,
    }) => {
      const analysisId = await seedAnalysis(page, { name: broken.fileName, files: sourcesNamed(dumps.broken, [broken.fileName]) });

      await goToWorkspace(page, analysisId);

      await expect(analysisUnavailableHint(page)).toHaveText(SOURCES_UNEXPLAINED);
      await expect(analysisUnavailableSources(page)).toHaveCount(0);
    });
  });

  test('workspace whose series cannot be read on opening toasts it, and lists the charts without drawing them', async ({ page }) => {
    const analysisId = await seedAnalysis(page, { name: 'Unreadable windows', canvas: canvasOf('s3', 's5') });
    await failRequests(page, '**/api/series', 'POST');
    await failRequests(page, '**/api/chart', 'POST');

    await goToWorkspace(page, analysisId);

    await expect(toastMessage(page)).toHaveText(SERIES_UNAVAILABLE);
    await expect(chartLibraryCount(page)).toHaveText('10 of 10');
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expect(drawnLines(page)).toHaveCount(0);
    await expect(page.locator('.chart-panel-header-stats-empty')).toHaveText(['no data', 'no data']);
  });

  test('workspace whose series stop being readable after a timeframe change toasts it and draws no line rather than the previous window under the new one', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Flaky windows', canvas: canvasOf('s3', 's5') });
    await failRequests(page, '**/api/chart', 'POST');

    await choosePreset(page, 'Last 7 days');

    await expect(toastMessage(page)).toHaveText(SERIES_UNAVAILABLE);
    await expect(timeframeLabel(page)).toHaveText('Last 7 days');
    await expect(drawnLines(page)).toHaveCount(0);
    await expect(page.locator('.chart-panel-header-stats-empty')).toHaveText(['no data', 'no data']);
  });
});
