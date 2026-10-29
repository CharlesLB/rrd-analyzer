import { type BrowserContext, expect, test } from '@playwright/test';
import { analysisNames, drawnLines, openBrowserApp, SAMPLE_ANALYSIS, SAMPLE_LINE_COUNT } from '../support/browser-app';
import {
  allowTheClipboard,
  answersOf,
  chartTitles,
  EXPIRING_SHARE_SERVICE_URL,
  EXPIRY_MILLISECONDS,
  liveBanner,
  recordServiceCalls,
  SHARE_SERVICE_URL,
  sentBodies,
  servedByTheExpiringService,
  sessionIdOf,
  sessionPath,
  sharedSessionTitle,
  sharedStates,
  shareLive,
  shareMark,
  sharePanel,
  shareTrigger,
  toastMessage,
  uploadedChunkPaths,
} from '../support/live-sessions';

const SAMPLE_FILE_COUNT = 10;
const SAMPLE_CHART_COUNT = 4;
const SESSION_GONE = 404;
const SESSION_HELD = 200;
const PLAINTEXT_MARKERS = [SAMPLE_ANALYSIS, 'api_http_requests.xml', 'api_system_cpu_user_percent.xml', '<rrd><version>'];
const LIBRARY_HASH = /\/app\/#\/$/;

const contexts: { opened: BrowserContext[] } = { opened: [] };

const pathsOfTheSession = (link: string, chunkPaths: readonly string[]): readonly string[] => [
  sessionPath(sessionIdOf(link)),
  `${sessionPath(sessionIdOf(link))}/state`,
  ...chunkPaths,
];

test.afterEach(async () => {
  await Promise.all(contexts.opened.map(async (context) => await context.close()));
  contexts.opened = [];
});

test.describe('journey: sharing live from the browser', () => {
  test('a visitor shares the sample live after a warning, a colleague follows every change from the link alone, someone with an altered key opens nothing, and ending the session erases it from the server and from the colleague’s tab', async ({
    page,
    context,
    browser,
  }) => {
    test.slow();
    await allowTheClipboard(context);
    const ownerCalls = recordServiceCalls(context);
    const colleague = await browser.newContext();
    contexts.opened.push(colleague);

    await test.step('opens the app from the sharing server and works on the sample, and nothing reaches the server', async () => {
      await openBrowserApp(page);

      await expect(shareMark(page)).toHaveText(['Local']);

      await page.locator('.analysis-row').first().click();

      await expect(drawnLines(page)).toHaveCount(SAMPLE_LINE_COUNT);
      await expect(page.locator('.log-track-marker').first()).toBeVisible();
      expect(ownerCalls.requests).toEqual([]);
    });

    await test.step('asks to share, reads that the files, the log and the charts would be uploaded, and backs out with nothing sent', async () => {
      await shareTrigger(page).click();

      await expect(page.locator('.share-warning-dialog-point').first()).toHaveText(
        `Its ${SAMPLE_FILE_COUNT} files, its log and every chart are encrypted on this device and uploaded to the sharing server.`,
      );

      await page.locator('.share-warning-dialog-cancel').click();

      await expect(page.locator('.share-warning-dialog')).toHaveCount(0);
      expect(ownerCalls.requests).toEqual([]);
    });

    const link = await test.step('creates the link: every file and the log go online, encrypted, and the link is on the clipboard', async () => {
      const created = await shareLive(page);

      await expect(toastMessage(page)).toHaveText('live link created and copied');
      await expect(sharedStates(page)).toHaveText(Array.from({ length: SAMPLE_FILE_COUNT + 1 }, () => 'online'));
      expect(created.startsWith(`${SHARE_SERVICE_URL}/app/#/shared/${sessionIdOf(created)}/`)).toBe(true);
      expect(await page.evaluate(async () => await navigator.clipboard.readText())).toBe(created);

      const bodies = sentBodies(ownerCalls);

      expect(uploadedChunkPaths(ownerCalls)).toHaveLength(SAMPLE_FILE_COUNT + 1);
      expect(PLAINTEXT_MARKERS.filter((marker) => bodies.some((body) => body.includes(marker)))).toEqual([]);

      const held = pathsOfTheSession(created, uploadedChunkPaths(ownerCalls));

      expect(await answersOf(page, SHARE_SERVICE_URL, held)).toEqual(held.map(() => SESSION_HELD));

      await page.locator('.share-panel-close').click();

      await expect(shareTrigger(page)).toHaveText('Online · 60 min');

      return created;
    });

    await test.step('someone holding the link with an altered key opens nothing', async () => {
      const intruder = await colleague.newPage();
      const keyStart = link.lastIndexOf('/') + 1;
      const alteredHead = link.startsWith('AAAA', keyStart) ? 'BBBB' : 'AAAA';
      const altered = `${link.slice(0, keyStart)}${alteredHead}${link.slice(keyStart + alteredHead.length)}`;

      await intruder.goto(altered);

      await expect(sharedSessionTitle(intruder)).toHaveText('This link is incomplete');

      await intruder.close();
    });

    const follower =
      await test.step('a colleague opens the link in a browser of their own and finds the same charts, the log, and a banner saying they follow it', async () => {
        const opened = await colleague.newPage();

        await opened.goto(link);

        await expect(liveBanner(opened)).toBeVisible();
        await expect(opened.locator('.live-session-banner-expiry')).toHaveText('erased 60 minutes after the last activity');
        await expect(opened.locator('.analysis-title-name')).toHaveText(SAMPLE_ANALYSIS);
        await expect(chartTitles(opened)).toHaveText(await chartTitles(page).allTextContents());
        await expect(drawnLines(opened)).toHaveCount(SAMPLE_LINE_COUNT);
        await expect(opened.locator('.log-track-marker').first()).toBeVisible();
        await expect(opened.locator('app-share-trigger')).toHaveCount(0);

        return opened;
      });

    await test.step('the visitor removes a chart and the colleague’s canvas follows', async () => {
      await page.locator('.chart-panel-header-remove').first().click();

      await expect(chartTitles(page)).toHaveCount(SAMPLE_CHART_COUNT - 1);
      await expect(chartTitles(follower)).toHaveText(await chartTitles(page).allTextContents());
    });

    await test.step('the visitor ends the session: the server erases it, and the colleague is taken back to a library without the shared copy', async () => {
      await shareTrigger(page).click();
      await page.locator('.share-panel-end').click();

      await expect(toastMessage(page)).toHaveText('live session ended: everything was erased from the server');
      await expect(sharePanel(page)).toHaveCount(0);
      await expect(shareTrigger(page)).toContainText('Share live');

      await expect(follower).toHaveURL(LIBRARY_HASH);
      await expect(toastMessage(follower)).toHaveText('the live session ended: its charts and files were erased from this tab');
      await expect(analysisNames(follower)).toHaveText([SAMPLE_ANALYSIS]);
      await expect(shareMark(follower)).toHaveText(['Local']);

      const erased = pathsOfTheSession(link, uploadedChunkPaths(ownerCalls));

      expect(await answersOf(page, SHARE_SERVICE_URL, erased)).toEqual(erased.map(() => SESSION_GONE));
    });

    await test.step('the link, opened again, says it has expired', async () => {
      const late = await colleague.newPage();

      await late.goto(link);

      await expect(sharedSessionTitle(late)).toHaveText('This link has expired');
      await expect(late.locator('.shared-session-page-retry')).toHaveCount(0);

      await late.locator('.shared-session-page-library').click();

      await expect(late).toHaveURL(LIBRARY_HASH);
    });
  });
});

test.describe('a live link that opens nothing', () => {
  test('a link cut short before the end of its key says it is incomplete, and nothing is asked of the server', async ({ page, context }) => {
    const calls = recordServiceCalls(context);

    await page.goto(`/app/#/shared/${'A'.repeat(22)}/${'B'.repeat(20)}`);

    await expect(sharedSessionTitle(page)).toHaveText('This link is incomplete');
    await expect(page.locator('.shared-session-page-detail')).toHaveText('Check that the whole link was copied, including the key at its end.');
    expect(calls.requests).toEqual([]);
  });

  test('a link to a session the server never held says it has expired', async ({ page }) => {
    await page.goto(`/app/#/shared/${'A'.repeat(22)}/${'B'.repeat(43)}`);

    await expect(sharedSessionTitle(page)).toHaveText('This link has expired');
  });
});

test.describe('journey: a live session left idle', () => {
  test('a visitor shares live and a colleague follows, both go quiet, and once the inactivity window passes the server erases everything, the colleague’s copy disappears, and the visitor learns it on the next change', async ({
    page,
    context,
    browser,
  }) => {
    test.slow();
    await servedByTheExpiringService(context);
    const ownerCalls = recordServiceCalls(context);
    const colleague = await browser.newContext();
    contexts.opened.push(colleague);
    await servedByTheExpiringService(colleague);

    const link = await test.step('shares the sample live', async () => {
      await openBrowserApp(page);
      await page.locator('.analysis-row').first().click();
      await expect(drawnLines(page)).toHaveCount(SAMPLE_LINE_COUNT);

      const created = await shareLive(page);

      await expect(page.locator('.share-panel-expiry')).toHaveText('Erased 1 minute after the last activity');
      await page.locator('.share-panel-close').click();

      return created;
    });

    const follower = await test.step('a colleague opens the link', async () => {
      const opened = await colleague.newPage();

      await opened.goto(link);

      await expect(liveBanner(opened)).toBeVisible();
      await expect(drawnLines(opened)).toHaveCount(SAMPLE_LINE_COUNT);

      const held = pathsOfTheSession(link, uploadedChunkPaths(ownerCalls));

      expect(await answersOf(page, EXPIRING_SHARE_SERVICE_URL, held)).toEqual(held.map(() => SESSION_HELD));
      expect(await answersOf(page, SHARE_SERVICE_URL, held)).toEqual(held.map(() => SESSION_GONE));

      return opened;
    });

    await test.step('nobody does anything until the window passes: the colleague’s copy is erased and they are back in their library', async () => {
      await expect(follower).toHaveURL(LIBRARY_HASH, { timeout: EXPIRY_MILLISECONDS * 3 });
      await expect(toastMessage(follower)).toHaveText('the live session ended: its charts and files were erased from this tab');
      await expect(analysisNames(follower)).toHaveText([SAMPLE_ANALYSIS]);
    });

    await test.step('the server holds nothing of the session: not its state and not one chunk of its files', async () => {
      const erased = pathsOfTheSession(link, uploadedChunkPaths(ownerCalls));

      expect(erased).toHaveLength(SAMPLE_FILE_COUNT + 3);
      expect(await answersOf(page, EXPIRING_SHARE_SERVICE_URL, erased)).toEqual(erased.map(() => SESSION_GONE));
    });

    await test.step('the visitor comes back, removes a chart, and is told the session ended; the analysis is local again', async () => {
      await page.locator('.chart-panel-header-remove').first().click();

      await expect(toastMessage(page)).toHaveText('the live session ended after an hour without activity');
      await expect(shareTrigger(page)).toContainText('Share live');

      await page.locator('.timeframe-bar-back').click();

      await expect(shareMark(page)).toHaveText(['Local']);
    });
  });
});
