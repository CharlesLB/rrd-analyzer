import { expect } from '@playwright/test';
import {
  canvasOf,
  openLibrary,
  REFERENCE_LABELS,
  resetLibrary,
  seedAnalysis,
  toastMessage,
  waitForCanvasSave,
  waitForLibraryOrderSave,
} from '../support/analyzer';
import { test } from '../support/fixtures';
import { accessOnAnEarlierDay, analysisRow, analysisRowNames } from '../support/library';
import {
  addToCanvas,
  analysisTitleName,
  applyAbsoluteRange,
  backToLibrary,
  chartHeader,
  chartLibraryFilter,
  chartPanel,
  chartPanels,
  chartTitles,
  choosePreset,
  contextMenuItem,
  dragAcrossChart,
  dragOnto,
  drawnLines,
  durationAndStep,
  hoverChartAt,
  libraryNames,
  libraryThumbnail,
  openContextMenuOn,
  referenceLabels,
  statChip,
  timeframeLabel,
  waitForChartsToSettle,
} from '../support/workspace';

const ORIGINAL_NAME = 'Q3 capacity';
const RENAMED = 'Q3 capacity · atlas prod';
const CPU = 'atlas_system_cpu_user';
const MEMORY = 'atlas_system_memory_used';
const REQUESTS = 'atlas_http_requests_rate';
const UPPER_QUARTER = 0.1;
const ABSOLUTE_WINDOW = '2026-08-20 08:30 to 2026-08-22 20:30';

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('journey: reviewing capacity', () => {
  test('a capacity planner reopens yesterday’s analysis, arranges the charts that matter, marks averages and peaks, reads several windows and finds it all kept after a reload', async ({
    page,
  }) => {
    test.slow();

    await test.step('opens yesterday’s analysis from the library', async () => {
      await seedAnalysis(page, { name: ORIGINAL_NAME, canvas: canvasOf('s3'), accessedHoursAgo: 30 });
      await openLibrary(page);

      await expect(page.locator('.analysis-row-access')).toHaveText([accessOnAnEarlierDay(30)]);

      await analysisRow(page, ORIGINAL_NAME).click();

      await expect(chartTitles(page)).toHaveText([CPU]);
      await expect(drawnLines(page)).toHaveCount(1);
    });

    await test.step('gives the analysis a name the team will recognise', async () => {
      await analysisTitleName(page).click();
      await page.locator('.analysis-title-input').fill(RENAMED);
      await page.locator('.analysis-title-input').press('Enter');

      await expect(analysisTitleName(page)).toHaveText(RENAMED);
    });

    await test.step('adds memory from the card menu and the request rate with a click', async () => {
      await addToCanvas(page, 'system_memory_used');

      await expect(toastMessage(page)).toHaveText(`${MEMORY} added to canvas`);

      await libraryThumbnail(page, 'http_requests_rate').click();

      await expect(chartTitles(page)).toHaveText([CPU, MEMORY, REQUESTS]);
      await expect(drawnLines(page)).toHaveCount(3);
    });

    await test.step('lifts the request rate to the head of the library and of the canvas, the load first', async () => {
      const libraryOrder = waitForLibraryOrderSave(page);
      await openContextMenuOn(page, 'http_requests_rate');
      await contextMenuItem(page, 'Move to top').click();
      await libraryOrder;

      await expect(libraryNames(page).first()).toHaveText('http_requests_rate');

      const canvasOrder = waitForCanvasSave(page);
      await waitForChartsToSettle(page);
      await dragOnto(page, chartHeader(page, REQUESTS), chartPanel(page, CPU), UPPER_QUARTER);
      await canvasOrder;

      await expect(chartTitles(page)).toHaveText([REQUESTS, CPU, MEMORY]);
    });

    await test.step('marks the average and the peak of the CPU over the last day', async () => {
      const cpu = chartPanel(page, CPU);

      await statChip(cpu, 'avg').click();
      await statChip(cpu, 'max').click();

      await expect(referenceLabels(cpu)).toHaveText(['max 56.4', 'avg 42.6']);
      await expect(referenceLabels(chartPanel(page, MEMORY))).toHaveCount(0);
    });

    await test.step('reads one moment across every chart with the crosshair', async () => {
      await hoverChartAt(page, 1, 0.5);

      await expect(page.locator('.chart-crosshair-line')).toHaveCount(3);
      await expect(page.locator('.chart-crosshair-tip-time')).toHaveText([/^29\/08 0[23]:\d\d$/, /^29\/08 0[23]:\d\d$/, /^29\/08 0[23]:\d\d$/]);

      await chartLibraryFilter(page).hover();

      await expect(page.locator('.chart-crosshair-line')).toHaveCount(0);
    });

    await test.step('looks at the whole week, then at a stretch of days typed in by hand', async () => {
      await choosePreset(page, 'Last 7 days');

      await expect(timeframeLabel(page)).toHaveText('Last 7 days');
      await expect(durationAndStep(page)).toHaveAttribute('title', '7.0 d · step 39 min');
      await expect(referenceLabels(chartPanel(page, CPU))).toHaveCount(2);

      await applyAbsoluteRange(page, '2026-08-20 08:30', '2026-08-22 20:30');

      await expect(timeframeLabel(page)).toHaveText(ABSOLUTE_WINDOW);
      await expect(durationAndStep(page)).toHaveAttribute('title', '2.5 d · step 14 min');
    });

    await test.step('zooms into the middle of those days and steps back out', async () => {
      await dragAcrossChart(page, 0.25, 0.75);

      await expect(timeframeLabel(page)).not.toHaveText(ABSOLUTE_WINDOW);

      await page.locator('.chart-panel-overlay').first().dblclick();

      await expect(timeframeLabel(page)).toHaveText(ABSOLUTE_WINDOW);
    });

    await test.step('reloads the window and finds the arrangement, the marks and the library order kept', async () => {
      await page.reload();

      await expect(analysisTitleName(page)).toHaveText(RENAMED);
      await expect(chartTitles(page)).toHaveText([REQUESTS, CPU, MEMORY]);
      await expect(drawnLines(page)).toHaveCount(3);
      await expect(referenceLabels(chartPanel(page, CPU))).toHaveText(['max 56.4', 'avg 42.6']);
      await expect(libraryNames(page)).toHaveText([REFERENCE_LABELS.s8, ...Object.values(REFERENCE_LABELS).filter((label) => label !== REFERENCE_LABELS.s8)]);
    });

    await test.step('goes back to the library, where the row carries the new name and the charts in their order', async () => {
      await backToLibrary(page);

      await expect(analysisRowNames(page)).toHaveText([RENAMED]);
      await expect(page.locator('.analysis-row-meta')).toHaveText(['3 charts · http_requests_rate, system_cpu_user, system_memory_used']);
      await expect(page.locator('.analysis-row-access')).toHaveText(['opened just now']);
      await expect(chartPanels(page)).toHaveCount(0);
    });
  });
});
