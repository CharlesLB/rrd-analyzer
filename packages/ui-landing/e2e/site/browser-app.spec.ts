import { expect, test } from '@playwright/test';
import {
  analysisNames,
  createAnalysisFrom,
  drawnLines,
  leavesTheSite,
  openBrowserApp,
  recordRequests,
  SAMPLE_ANALYSIS,
  SAMPLE_FINDING_COUNT,
  SAMPLE_LINE_COUNT,
  sendsSomething,
  xmlDumpOf,
} from '../support/browser-app';

const VISITOR_FILE = 'my-server.xml';
const VISITOR_VALUES = [12, 18, 15, 22, 30, 26, 19, 24, 28, 35, 31, 27];

test.describe('app in the browser, served beside the landing page', () => {
  test('demo of the landing page opens the app, which says straight away that nothing leaves the tab', async ({ page }) => {
    await page.goto('/');

    await page.locator('.demo-section-poster').click();

    await expect(page).toHaveURL(/\/app\/(#\/)?$/);
    await expect(page.locator('.browser-edition-notice-label')).toHaveText('Running in your browser');
    await expect(page.locator('.browser-edition-notice-privacy')).toContainText('Nothing you open is uploaded or saved on our servers');
    await expect(page.locator('.browser-edition-notice-privacy')).toContainText('erased when you close or reload it');
  });

  test('app opens on the sample analysis and draws its charts, all of it computed in the tab', async ({ page }) => {
    await openBrowserApp(page);

    await expect(analysisNames(page)).toHaveText([SAMPLE_ANALYSIS]);

    await page.locator('.analysis-row').first().click();

    await expect(drawnLines(page)).toHaveCount(SAMPLE_LINE_COUNT);
  });

  test('sample analysis opens with its log already placed on the track under the charts', async ({ page }) => {
    await openBrowserApp(page);
    await page.locator('.analysis-row').first().click();

    await expect(page.locator('.log-track')).toBeVisible();
    await expect(page.locator('.log-setup-panel')).toHaveCount(0);
    await expect(page.locator('.log-track-marker').first()).toBeVisible();
  });

  test('insights run in the tab and find what the sample is built around', async ({ page }) => {
    await openBrowserApp(page);
    await page.locator('.analysis-row').first().click();
    await expect(drawnLines(page)).toHaveCount(SAMPLE_LINE_COUNT);

    await page.locator('.insights-trigger-idle').click();

    await expect(page.locator('.finding-card')).toHaveCount(SAMPLE_FINDING_COUNT);
  });

  test('a file the visitor opens is read in the tab: no request carries anything anywhere', async ({ page }) => {
    const recording = recordRequests(page);
    await openBrowserApp(page);

    await createAnalysisFrom(page, VISITOR_FILE, xmlDumpOf(VISITOR_VALUES));

    await expect(page.locator('.chart-library-count')).toHaveText('1 of 1');
    expect(recording.requests.filter(leavesTheSite).map((request) => request.url())).toEqual([]);
    expect(recording.requests.filter(sendsSomething).map((request) => `${request.method()} ${request.url()}`)).toEqual([]);
  });

  test('reloading the tab erases everything the visitor opened', async ({ page }) => {
    await openBrowserApp(page);
    await createAnalysisFrom(page, VISITOR_FILE, xmlDumpOf(VISITOR_VALUES));
    await expect(page.locator('.chart-library-count')).toHaveText('1 of 1');

    await openBrowserApp(page);
    await page.reload();

    await expect(analysisNames(page)).toHaveText([SAMPLE_ANALYSIS]);
  });

  test('notice of the app offers the offline app on the landing page downloads', async ({ page }) => {
    await openBrowserApp(page);

    await page.locator('.browser-edition-notice-download').click();

    await expect(page).toHaveURL(/\/#download$/);
    await expect(page.locator('#download .platform-card').first()).toBeVisible();
  });
});
