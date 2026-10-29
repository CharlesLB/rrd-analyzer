import { expect, type Page, type Response } from '@playwright/test';
import { failRequests, openLibrary, resetLibrary, seedAnalysis, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import { analysisRow } from '../support/library';
import { emptyDump } from '../support/new-analysis-dialog';
import { addSourcesFromMenu, giveThePickedFilesTheirPaths } from '../support/picked-files';
import { sourcesNamed, type WrittenSource, writeRrdFixtures } from '../support/rrd-fixtures';
import {
  answersOfTheService,
  chunkPaths,
  liveSessionsOfTheDaemon,
  openedState,
  type SessionLink,
  SHARE_SERVICE_URL,
  type SharedState,
  sealedStateOf,
  sessionLinkOf,
  sessionPath,
  sharedFileNames,
  sharedFileStates,
  shareMark,
  sharePanel,
  shareTrigger,
  shareWarning,
  statePath,
} from '../support/share-service';
import { backToLibrary, drawnLines, libraryThumbnail } from '../support/workspace';

const ANALYSIS = 'Atlas host · shared live';
const SHARED_FILES = ['atlas_cpu.xml', 'atlas_traffic.xml'];
const ADDED_FILE = 'temperature.xml';
const DUMP_SIZE = 512;
const SESSION_PATTERN = '**/api/analyses/*/session';
const PUT_METHOD = 'PUT';
const SESSION_GONE = 404;
const SESSION_HELD = 200;
const LINK_SHAPE = /^http:\/\/127\.0\.0\.1:\d+\/app\/#\/shared\/[\w-]+\/[\w-]{43}$/;

const dumps: { written: readonly WrittenSource[] } = { written: [] };
const shared: { url: string; link: SessionLink; files: SharedState['files'] } = { url: '', link: { sessionId: '', key: Buffer.alloc(0) }, files: [] };

const isPublication = (response: Response): boolean => response.request().method() === PUT_METHOD && response.url().endsWith('/session') && response.ok();

const stateOfTheServer = async (page: Page): Promise<SharedState> => openedState(shared.link, await sealedStateOf(page, shared.link.sessionId));

test.beforeAll(() => {
  dumps.written = writeRrdFixtures();
});

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await resetLibrary(page);
});

test.describe('journey: sharing live from the desktop', () => {
  test('an engineer shares an analysis of dumps read off disk after a warning, sees each file go online, keeps a file that could not be sent marked local until the next change sends it, finds the same link after a reload, and ends the session, which erases it from the server', async ({
    page,
  }) => {
    test.slow();

    await test.step('finds the analysis marked as kept only on this computer', async () => {
      await seedAnalysis(page, {
        name: ANALYSIS,
        files: sourcesNamed(dumps.written, SHARED_FILES),
        canvas: [
          { seriesId: 's0', label: 'cpu_user' },
          { seriesId: 's2', label: 'traffic_in' },
        ],
      });
      await openLibrary(page);

      await expect(shareMark(page, ANALYSIS)).toHaveText('Local');
    });

    await test.step('asks to share it, is told what would leave the computer, and backs out with nothing sent', async () => {
      await analysisRow(page, ANALYSIS).click();
      await expect(drawnLines(page)).toHaveCount(2);

      await shareTrigger(page).click();

      await expect(shareWarning(page).locator('.share-warning-dialog-point')).toHaveText([
        'Its 2 files and every chart are encrypted on this device and uploaded to the sharing server.',
        'While the session lives, every change you make is sent too: charts, colors, new files and the log.',
        'Everything is erased from the server 1 hour after the last activity, or as soon as you end the session. Closing the app does not end it.',
        'The key is part of the link and never reaches the server. Send it only to people who may see this data.',
      ]);

      await page.locator('.share-warning-dialog-cancel').click();

      await expect(shareWarning(page)).toHaveCount(0);
      await expect(shareTrigger(page)).toContainText('Share live');
      expect(await liveSessionsOfTheDaemon(page)).toEqual([]);
    });

    await test.step('creates the link: both files go online, and the link is on the clipboard', async () => {
      await shareTrigger(page).click();
      await page.locator('.share-warning-dialog-confirm').click();

      await expect(sharePanel(page)).toBeVisible();
      await expect(toastMessage(page)).toHaveText('live link created and copied');
      await expect(sharedFileNames(page)).toHaveText(SHARED_FILES);
      await expect(sharedFileStates(page)).toHaveText(['online', 'online']);

      const link = await page.locator('.share-panel-link-field').inputValue();

      expect(link.startsWith(SHARE_SERVICE_URL)).toBe(true);
      expect(link).toMatch(LINK_SHAPE);
      expect(await page.evaluate(async () => await navigator.clipboard.readText())).toBe(link);

      shared.url = link;
      shared.link = sessionLinkOf(link);
    });

    await test.step('the server keeps only ciphertext, which the key in the link opens to the analysis, both files and both charts', async () => {
      const sealed = await sealedStateOf(page, shared.link.sessionId);

      expect(sealed.includes(ANALYSIS)).toBe(false);
      expect(SHARED_FILES.some((fileName) => sealed.includes(fileName))).toBe(false);

      const state = openedState(shared.link, sealed);

      expect(state.name).toBe(ANALYSIS);
      expect(state.files.map((file) => file.name)).toEqual(SHARED_FILES);
      expect(state.canvas.map((chart) => chart.label)).toEqual(['cpu_user', 'traffic_in']);
    });

    await test.step('adds a file while the server cannot be reached: the change is not sent, and the panel marks that file local', async () => {
      await sharePanel(page).locator('.modal-dialog-close').click();
      await giveThePickedFilesTheirPaths(page, dumps.written);
      await failRequests(page, SESSION_PATTERN, PUT_METHOD);

      await addSourcesFromMenu(page, [emptyDump(ADDED_FILE, DUMP_SIZE)]);

      await expect(toastMessage(page)).toHaveText('the latest changes could not be sent to the live session');

      await backToLibrary(page);

      await expect(shareMark(page, ANALYSIS)).toHaveText('Online · 60 min');

      await analysisRow(page, ANALYSIS).click();
      await shareTrigger(page).click();

      await expect(sharedFileNames(page)).toHaveText([...SHARED_FILES, ADDED_FILE]);
      await expect(sharedFileStates(page)).toHaveText(['online', 'online', 'local']);
      expect((await stateOfTheServer(page)).files.map((file) => file.name)).toEqual(SHARED_FILES);
    });

    await test.step('once the server answers again, the next change sends the file, and every file is online', async () => {
      await page.unroute(SESSION_PATTERN);
      await sharePanel(page).locator('.modal-dialog-close').click();

      const publication = page.waitForResponse(isPublication);

      await libraryThumbnail(page, 'temperature').click();
      await publication;
      await shareTrigger(page).click();

      await expect(sharedFileStates(page)).toHaveText(['online', 'online', 'online']);
      await expect.poll(async () => (await stateOfTheServer(page)).canvas.map((chart) => chart.label)).toEqual(['cpu_user', 'traffic_in', 'temperature']);

      shared.files = (await stateOfTheServer(page)).files;

      expect(shared.files.map((file) => file.name)).toEqual([...SHARED_FILES, ADDED_FILE]);
    });

    await test.step('reopens the app and finds the same live link', async () => {
      await page.reload();
      await shareTrigger(page).click();

      await expect(page.locator('.share-panel-link-field')).toHaveValue(shared.url);
      await expect(sharedFileStates(page)).toHaveText(['online', 'online', 'online']);
    });

    await test.step('ends the session: the server erases the state and every chunk, and the analysis is local again', async () => {
      const sessionPaths = [sessionPath(shared.link.sessionId), statePath(shared.link.sessionId), ...chunkPaths(shared.link.sessionId, shared.files)];

      expect(sessionPaths).toHaveLength(5);
      expect(await answersOfTheService(page, sessionPaths)).toEqual(sessionPaths.map(() => SESSION_HELD));

      await page.locator('.share-panel-end').click();

      await expect(toastMessage(page)).toHaveText('live session ended: everything was erased from the server');
      await expect(sharePanel(page)).toHaveCount(0);
      await expect(shareTrigger(page)).toContainText('Share live');

      expect(await answersOfTheService(page, sessionPaths)).toEqual(sessionPaths.map(() => SESSION_GONE));

      await backToLibrary(page);

      await expect(shareMark(page, ANALYSIS)).toHaveText('Local');
    });
  });
});
