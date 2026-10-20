import { expect, type Locator, type Page } from '@playwright/test';
import { canvasOf, goToWorkspace, holdAnswers, recordChartQueries, resetLibrary, seedAnalysis, seedWorkspace } from '../support/analyzer';
import { test } from '../support/fixtures';
import { boxOf, dragAcrossChart, durationAndStep, timeframeLabel } from '../support/workspace';

const DAY_WINDOW_LABEL = /^2026-08-\d\d \d\d:\d\d to 2026-08-\d\d \d\d:\d\d$/;
const STRIP_TICKS = ['30 Jul', '5 Aug', '11 Aug', '17 Aug', '23 Aug', '29 Aug'];
const LAST_DAY_PLACEMENT = /left: 96\.6\d*%; width: 3\.3\d*%/;
const DRAG_STEPS = 20;
const SETTLED_QUERY_WAIT_MILLISECONDS = 600;

const track = (page: Page): Locator => page.locator('.timeline-strip-track');

const stripWindow = (page: Page): Locator => page.locator('.timeline-strip-window');

const startHandle = (page: Page): Locator => page.locator('.timeline-strip-handle').first();

const undoLastZoom = async (page: Page): Promise<void> => {
  await page.locator('.chart-panel-overlay').first().dblclick();
};

const centreOf = async (locator: Locator): Promise<{ readonly x: number; readonly y: number }> => {
  const box = await boxOf(locator);

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const dragHorizontally = async (page: Page, from: Locator, trackFraction: number): Promise<void> => {
  const start = await centreOf(from);
  const trackBox = await boxOf(track(page));

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + trackBox.width * trackFraction, start.y, { steps: DRAG_STEPS });
  await page.mouse.up();
};

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('timeline strip', () => {
  test('strip spans the whole of the files with six dated ticks and the lead chart drawn across it, the last day sitting at its right end', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });

    await expect(page.locator('.timeline-strip-tick-label')).toHaveText(STRIP_TICKS);
    await expect(page.locator('.timeline-overview-line')).toHaveAttribute('d', /^M/);
    await expect(stripWindow(page)).toHaveAttribute('style', LAST_DAY_PLACEMENT);
  });

  test('window dragged along the strip keeps its length, takes the charts with it, and one double-click returns it to where the drag began', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const firstTick = page.locator('.chart-panel-tick').first();
    const tickBeforeTheDrag = await firstTick.textContent();

    await dragHorizontally(page, stripWindow(page), -0.3);

    await expect(timeframeLabel(page)).toHaveText(DAY_WINDOW_LABEL);
    await expect(durationAndStep(page)).toHaveAttribute('title', '24 h · step 6 min');
    await expect(firstTick).not.toHaveText(tickBeforeTheDrag ?? '');
    await expect(stripWindow(page)).not.toHaveAttribute('style', LAST_DAY_PLACEMENT);

    await undoLastZoom(page);

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('start edge pulled to the left widens the window back in time while its end stays put, and pulled again follows the pointer all the way', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await dragHorizontally(page, startHandle(page), -0.2);

    await expect(timeframeLabel(page)).toHaveText('Last 7 days');
    await expect(durationAndStep(page)).toHaveAttribute('title', /^7\.0 d · /);

    await dragHorizontally(page, startHandle(page), 0.1);

    await expect(timeframeLabel(page)).toHaveText(/^2026-08-2\d \d\d:\d\d to 2026-08-29 15:00$/);
    await expect(durationAndStep(page)).toHaveAttribute('title', /^4\.0 d · /);
  });

  test('press on bare track re-centres the window on the moment pressed, keeping its length', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const trackBox = await boxOf(track(page));

    await track(page).click({ position: { x: trackBox.width / 2, y: trackBox.height / 2 } });

    await expect(timeframeLabel(page)).toHaveText(/^2026-08-14 0\d:\d\d to 2026-08-15 0\d:\d\d$/);
    await expect(durationAndStep(page)).toHaveAttribute('title', '24 h · step 6 min');

    await undoLastZoom(page);

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('a right or a middle press on the strip leaves the window where it was', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const trackBox = await boxOf(track(page));
    const middleOfTrack = { x: trackBox.width / 2, y: trackBox.height / 2 };

    await track(page).click({ button: 'right', position: middleOfTrack });
    await track(page).click({ button: 'middle', position: middleOfTrack });
    await stripWindow(page).click({ button: 'right' });

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
    await expect(stripWindow(page)).toHaveAttribute('style', LAST_DAY_PLACEMENT);
  });

  test('a press on the window that moves nothing leaves no step behind, so a double-click still undoes the zoom before it', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await dragAcrossChart(page, 0.25, 0.75);
    await expect(durationAndStep(page)).toHaveAttribute('title', '12 h · step 3 min');

    await stripWindow(page).click();
    await undoLastZoom(page);

    await expect(timeframeLabel(page)).toHaveText('Last 24 hours');
  });

  test('a slide along the strip asks for the charts once it comes to rest, not at every step of the drag', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    const chartQueries = recordChartQueries(page);

    await dragHorizontally(page, stripWindow(page), -0.4);

    await expect(timeframeLabel(page)).toHaveText(DAY_WINDOW_LABEL);
    await expect.poll(() => chartQueries.requests.length).toBe(1);
    await page.waitForTimeout(SETTLED_QUERY_WAIT_MILLISECONDS);
    chartQueries.stop();
    expect(chartQueries.requests).toHaveLength(1);
  });

  test('strip stays away while the analysis is being read, rather than dating its ticks at the 1970 epoch', async ({ page }) => {
    const analysisId = await seedAnalysis(page, { name: 'Slow to read', canvas: canvasOf('s3') });
    const releaseBundle = await holdAnswers(page, '**/api/analyses/*/bundle', 'GET');

    await goToWorkspace(page, analysisId);

    await expect(page.locator('.timeframe-bar')).toBeVisible();
    await expect(page.locator('.timeline-strip')).toHaveCount(0);
    await expect(page.getByText('1 Jan')).toHaveCount(0);

    releaseBundle();

    await expect(page.locator('.timeline-strip-tick-label')).toHaveText(STRIP_TICKS);
  });
});
