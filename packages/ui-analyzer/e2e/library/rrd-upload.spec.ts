import { expect } from '@playwright/test';
import { resetLibrary, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import { analysisRowNames } from '../support/library';
import { createButton, openNewAnalysisDialog, pickSources, readinessHint, sourceNames } from '../support/new-analysis-dialog';
import { BINARY_RRD_FIXTURE, FIXTURE_FILE_NAMES, sourcesNamed, type WrittenSource, writeRrdFixtures } from '../support/rrd-fixtures';
import { analysisTitleName, backToLibrary } from '../support/workspace';

const BYTES_PER_KILOBYTE = 1024;

const dumps: { written: readonly WrittenSource[] } = { written: [] };

const pathsOf = (fileNames: readonly string[]): readonly string[] => sourcesNamed(dumps.written, fileNames).map((source) => source.path);

const kilobytesOf = (fileNames: readonly string[]): readonly string[] =>
  sourcesNamed(dumps.written, fileNames).map((source) => `${Math.round(source.size / BYTES_PER_KILOBYTE)} KB`);

test.beforeAll(() => {
  dumps.written = writeRrdFixtures();
});

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
  await openNewAnalysisDialog(page);
});

test.describe('uploading round robin databases', () => {
  test('new analysis dialog given every fixture dump lists each under its own name and its size on disk', async ({ page }) => {
    await pickSources(page, pathsOf(FIXTURE_FILE_NAMES));

    await expect(sourceNames(page)).toHaveText(FIXTURE_FILE_NAMES);
    await expect(page.locator('.pending-source-list-size')).toHaveText(kilobytesOf(FIXTURE_FILE_NAMES));
    await expect(readinessHint(page)).toHaveText(`${FIXTURE_FILE_NAMES.length} sources ready`);
    await expect(createButton(page)).toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('new analysis dialog takes a binary database and a dump saved under .rrd as readily as an .xml dump', async ({ page }) => {
    await pickSources(page, pathsOf([BINARY_RRD_FIXTURE.fileName, 'atlas_latency.rrd', 'temperature.xml']));

    await expect(sourceNames(page)).toHaveText([BINARY_RRD_FIXTURE.fileName, 'atlas_latency.rrd', 'temperature.xml']);
    await expect(createButton(page)).toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('new analysis dialog keeps the uploaded dumps when a log file is picked after them', async ({ page }) => {
    await pickSources(page, pathsOf(['atlas_cpu.xml']));

    await pickSources(page, [{ name: 'rrdtool.log', mimeType: 'text/plain', buffer: Buffer.from('not a dump') }]);

    await expect(toastMessage(page)).toHaveText('Only .rrd or .xml dumps are supported');
    await expect(sourceNames(page)).toHaveText(['atlas_cpu.xml']);
    await expect(createButton(page)).toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('Create analysis from uploaded dumps opens a workspace under the typed name and lists it in the library', async ({ page }) => {
    await page.locator('.new-analysis-dialog-input').fill('Uploaded dumps');
    await pickSources(page, pathsOf(['atlas_cpu.xml', 'atlas_traffic.xml', 'temperature.xml']));

    await createButton(page).click();

    await expect(analysisTitleName(page)).toHaveText('Uploaded dumps');

    await backToLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['Uploaded dumps']);
  });

  test('Create analysis from a single unnamed dump names the analysis after that dump', async ({ page }) => {
    await pickSources(page, pathsOf(['temperature.xml']));

    await createButton(page).click();

    await expect(analysisTitleName(page)).toHaveText('temperature');
  });
});
