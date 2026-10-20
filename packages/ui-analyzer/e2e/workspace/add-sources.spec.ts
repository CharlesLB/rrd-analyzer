import { expect, type Page } from '@playwright/test';
import { resetLibrary, seedWorkspace, toastMessage } from '../support/analyzer';
import { daemonAddressed } from '../support/daemon';
import { test } from '../support/fixtures';
import { emptyDump, type PickedSources } from '../support/new-analysis-dialog';
import { BROKEN_SOURCES, sourcesNamed, type WrittenSource, writeBrokenSources, writeRrdFixtures } from '../support/rrd-fixtures';
import { chartLibraryCount, chartTitles, libraryNames } from '../support/workspace';

const ADD_SOURCES_PATTERN = '**/api/analyses/*/sources';
const POST_METHOD = 'POST';
const DUMP_SIZE = 512;

const dumps: { written: readonly WrittenSource[] } = { written: [] };

type PickedFile = { readonly name: string; readonly path: string; readonly size: number };

const locateOnDisk = (file: PickedFile): PickedFile => dumps.written.find((written) => written.name === file.name) ?? file;

const giveThePickedFilesTheirPaths = async (page: Page): Promise<void> => {
  await page.route(ADD_SOURCES_PATTERN, async (route) => {
    if (route.request().method() !== POST_METHOD) {
      await route.fallback();

      return;
    }

    const body = route.request().postDataJSON() as { files: readonly PickedFile[] };
    const located = JSON.stringify({ files: body.files.map(locateOnDisk) });
    const answer = await route.fetch({ url: daemonAddressed(route.request().url()), postData: located });

    await route.fulfill({ response: answer });
  });
};

const addSourcesFromMenu = async (page: Page, sources: PickedSources): Promise<void> => {
  const choosing = page.waitForEvent('filechooser');

  await page.locator('.analysis-title-menu-toggle').click();
  await page.locator('.analysis-title-menu-item').filter({ hasText: 'Add RRD files' }).click();
  await (await choosing).setFiles(sources);
};

test.beforeAll(() => {
  dumps.written = [...writeRrdFixtures(), ...writeBrokenSources()];
});

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
  await seedWorkspace(page, { name: 'Growing', files: sourcesNamed(dumps.written, ['temperature.xml']), canvas: [{ seriesId: 's0', label: 'temperature' }] });
  await giveThePickedFilesTheirPaths(page);
});

test.describe('adding sources to an open analysis', () => {
  test('the files picked from the analysis menu join its chart library after its own series, and the canvas stays as it was', async ({ page }) => {
    await expect(chartLibraryCount(page)).toHaveText('1 of 1');

    await addSourcesFromMenu(page, [emptyDump('atlas_cpu.xml', DUMP_SIZE)]);

    await expect(toastMessage(page)).toHaveText('1 file added to the analysis');
    await expect(chartLibraryCount(page)).toHaveText('3 of 3');
    await expect(libraryNames(page)).toHaveText(['temperature', 'cpu_user', 'cpu_system']);
    await expect(chartTitles(page)).toHaveText(['temperature']);
  });

  test('picking only files the analysis already reads adds nothing and says so', async ({ page }) => {
    await addSourcesFromMenu(page, [emptyDump('temperature.xml', DUMP_SIZE)]);

    await expect(toastMessage(page)).toHaveText('the analysis already reads every file picked');
    await expect(chartLibraryCount(page)).toHaveText('1 of 1');
  });

  test('a file that cannot be read is refused and the analysis keeps reading what it had', async ({ page }) => {
    await addSourcesFromMenu(page, [emptyDump(BROKEN_SOURCES.NOT_A_DATABASE.fileName, DUMP_SIZE)]);

    await expect(toastMessage(page)).toHaveText('the files could not be added: one of them could not be read');
    await expect(chartLibraryCount(page)).toHaveText('1 of 1');
  });
});
