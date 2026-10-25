import { expect } from '@playwright/test';
import { openLibrary, resetLibrary, seedAnalysis, toastMessage } from '../support/analyzer';
import { downloadedBytes, downloadFrom } from '../support/downloads';
import { test } from '../support/fixtures';
import { analysisRowNames, analysisRows } from '../support/library';
import { sourcesNamed, type WrittenSource, writeRrdFixtures } from '../support/rrd-fixtures';
import {
  analysisTitleName,
  backToLibrary,
  chartHeader,
  chartLibraryCount,
  chartPanel,
  chartPanels,
  chartTitles,
  dragOnto,
  dragOver,
  drawnLines,
  libraryNames,
  libraryThumbnail,
  statisticUnits,
  statValues,
  waitForChartsToSettle,
} from '../support/workspace';

const PICKED_FILES = ['atlas_cpu.xml', 'atlas_traffic.xml', 'temperature.xml'];
const RENAMED = 'Atlas host · from disk';
const CPU_USER = 'atlas_cpu_user';
const CPU_SYSTEM = 'atlas_cpu_system';
const TRAFFIC_IN = 'atlas_traffic_in';
const TEMPERATURE = 'temperature';
const MERGED_CPU = `${CPU_USER} + ${CPU_SYSTEM}`;
const ZIP_SIGNATURE = 'PK\u0003\u0004';
const MIDDLE = 0.5;
const LOWER_QUARTER = 0.9;

const dumps: { written: readonly WrittenSource[] } = { written: [] };

test.beforeAll(() => {
  dumps.written = writeRrdFixtures();
});

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('journey: reading files off disk', () => {
  test('an operator opens the dumps of one host read straight off disk, overlays its two CPU series, reads traffic and temperature beside them, takes the sources away in a zip and clears the analysis out', async ({
    page,
  }) => {
    test.slow();

    await test.step('opens the analysis the desktop app made over the host’s dumps, still untitled and with nothing plotted', async () => {
      await seedAnalysis(page, { name: 'Untitled analysis', files: sourcesNamed(dumps.written, PICKED_FILES) });
      await openLibrary(page);

      await expect(page.locator('.analysis-row-meta')).toHaveText([/^0 charts/]);

      await analysisRows(page).click();

      await expect(analysisTitleName(page)).toHaveText('Untitled analysis');
      await expect(page.locator('.chart-canvas-empty')).toContainText('Empty canvas.');
      await expect(chartLibraryCount(page)).toHaveText('5 of 5');
      await expect(libraryNames(page)).toHaveText(['cpu_user', 'cpu_system', 'traffic_in', 'traffic_out', 'temperature']);
      await expect(page.locator('.library-thumbnail').first()).toHaveAttribute('title', 'atlas_cpu.xml');
    });

    await test.step('opens both CPU series and merges them onto one axis', async () => {
      await libraryThumbnail(page, 'cpu_user').click();
      await libraryThumbnail(page, 'cpu_system').click();

      await expect(chartTitles(page)).toHaveText([CPU_USER, CPU_SYSTEM]);

      await waitForChartsToSettle(page);
      await dragOnto(page, chartHeader(page, CPU_SYSTEM), chartPanel(page, CPU_USER), MIDDLE);

      await expect(chartTitles(page)).toHaveText([MERGED_CPU]);
      await expect(chartPanel(page, MERGED_CPU).locator('.plot-drawing-line')).toHaveCount(2);
      await expect(chartPanel(page, MERGED_CPU).locator('.chart-plot-axis-value:nth-child(2)')).toHaveCount(0);
    });

    await test.step('adds the inbound traffic with a click and drops the temperature under it', async () => {
      await libraryThumbnail(page, 'traffic_in').click();

      await expect(drawnLines(page)).toHaveCount(3);

      await waitForChartsToSettle(page);
      await dragOver(page, libraryThumbnail(page, 'temperature'), chartPanel(page, TRAFFIC_IN), LOWER_QUARTER);

      await expect(chartPanel(page, TRAFFIC_IN).locator('.chart-drop-indicator-after')).toBeVisible();

      await page.mouse.up();

      await expect(chartTitles(page)).toHaveText([MERGED_CPU, TRAFFIC_IN, TEMPERATURE]);
      await expect(drawnLines(page)).toHaveCount(4);
    });

    await test.step('reads a counter as a rate per second and the gauge as it was written', async () => {
      await expect(statisticUnits(page)).toHaveText(['/s', 'n/a']);
      await expect(statValues(page, 'avg')).toHaveText(['9232', '20.8']);
    });

    await test.step('names the analysis and takes its source files away in one zip', async () => {
      await analysisTitleName(page).click();
      await page.locator('.analysis-title-input').fill(RENAMED);
      await page.locator('.analysis-title-input').press('Enter');

      await expect(analysisTitleName(page)).toHaveText(RENAMED);

      await page.locator('.analysis-title-menu-toggle').click();

      const download = await downloadFrom(
        page,
        async () => await page.locator('app-analysis-title .menu-option').filter({ hasText: 'Export RRD files' }).click(),
      );

      const archive = (await downloadedBytes(download)).toString('latin1');

      expect(download.suggestedFilename()).toBe('atlas-host-from-disk.zip');
      expect(archive.startsWith(ZIP_SIGNATURE)).toBe(true);
      expect(PICKED_FILES.filter((fileName) => !archive.includes(fileName))).toEqual([]);
      await expect(toastMessage(page)).toHaveText('RRD files exported · 3 files in one zip');
    });

    await test.step('finds it in the library with its charts, and deletes it once the zip is safe', async () => {
      await backToLibrary(page);

      await expect(analysisRowNames(page)).toHaveText([RENAMED]);
      await expect(page.locator('.analysis-row-meta')).toHaveText(['3 charts · cpu_user + cpu_system, traffic_in, temperature']);

      await page.locator('.analysis-row-delete').click();

      await expect(toastMessage(page)).toHaveText('analysis deleted');
      await expect(analysisRows(page)).toHaveCount(0);
      await expect(chartPanels(page)).toHaveCount(0);
    });
  });
});
