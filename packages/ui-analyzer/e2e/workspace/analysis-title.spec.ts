import { readFile } from 'node:fs/promises';
import { type Download, expect, type Locator, type Page } from '@playwright/test';
import { canvasOf, resetLibrary, seedWorkspace, toastMessage } from '../support/analyzer';
import { downloadedBytes, downloadFrom } from '../support/downloads';
import { test } from '../support/fixtures';
import { insightsPanel, runInsights } from '../support/insights';
import { analysisRowNames } from '../support/library';
import { sourcesNamed, type WrittenSource, writeRrdFixtures } from '../support/rrd-fixtures';
import { analysisTitleName, backToLibrary } from '../support/workspace';

const ZIP_SIGNATURE = 'PK\u0003\u0004';

const dumps: { written: readonly WrittenSource[] } = { written: [] };

const nameField = (page: Page): Locator => page.locator('.analysis-title-input');

const sourcesItem = (page: Page): Locator => page.locator('.analysis-title-menu-item').filter({ hasText: 'Export RRD files' });

const menuToggle = (page: Page): Locator => page.locator('.analysis-title-menu-toggle');

const readSource = async (source: WrittenSource): Promise<Buffer> => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path comes from writeRrdFixtures, a literal catalogue of fixtures this suite wrote itself
  return await readFile(source.path);
};

const exportSources = async (page: Page): Promise<Download> => {
  await page.locator('.analysis-title-menu-toggle').click();

  return await downloadFrom(page, async () => await sourcesItem(page).click());
};

test.beforeAll(() => {
  dumps.written = writeRrdFixtures();
});

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('analysis title', () => {
  test('the name clicked becomes a field, and the name typed into it is kept by the library', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await analysisTitleName(page).click();
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toHaveValue('Atlas prod · capacity');
    await nameField(page).fill('  Atlas prod · p99  ');
    await nameField(page).press('Enter');

    await expect(analysisTitleName(page)).toHaveText('Atlas prod · p99');

    await backToLibrary(page);
    await expect(analysisRowNames(page)).toHaveText(['Atlas prod · p99']);
  });

  test('a rename escaped, or cleared to nothing, keeps the name the analysis had', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await analysisTitleName(page).click();
    await nameField(page).fill('Discarded');
    await nameField(page).press('Escape');
    await expect(analysisTitleName(page)).toHaveText('Atlas prod · capacity');

    await analysisTitleName(page).click();
    await nameField(page).fill('   ');
    await nameField(page).press('Enter');
    await expect(analysisTitleName(page)).toHaveText('Atlas prod · capacity');
  });

  test('the menu of a one-file analysis downloads that rrd file byte for byte', async ({ page }) => {
    const [source] = sourcesNamed(dumps.written, ['temperature.xml']);
    await seedWorkspace(page, { name: 'Temperature', files: [source], canvas: [{ seriesId: 's0', label: 'temperature' }] });

    await page.locator('.analysis-title-menu-toggle').click();
    await expect(sourcesItem(page).locator('.analysis-title-menu-detail')).toHaveText('a copy of the source file');
    await page.keyboard.press('Escape');
    const download = await exportSources(page);

    expect(download.suggestedFilename()).toBe('temperature.xml');
    expect((await downloadedBytes(download)).equals(await readSource(source))).toBe(true);
    await expect(toastMessage(page)).toHaveText('RRD file exported');
  });

  test('the menu of a several-file analysis downloads one zip named after the analysis', async ({ page }) => {
    const files = sourcesNamed(dumps.written, ['atlas_cpu.xml', 'temperature.xml']);
    await seedWorkspace(page, { name: 'Atlas prod · capacity', files, canvas: [{ seriesId: 's0', label: 'cpu_user' }] });

    const download = await exportSources(page);
    const archive = (await downloadedBytes(download)).toString('latin1');

    expect(download.suggestedFilename()).toBe('atlas-prod-capacity.zip');
    expect(archive.startsWith(ZIP_SIGNATURE)).toBe(true);
    expect(archive).toContain('atlas_cpu.xml');
    expect(archive).toContain('temperature.xml');
    await expect(toastMessage(page)).toHaveText('RRD files exported · 2 files in one zip');
  });

  test('the menu of an analysis whose sources are not on disk says the files could not be exported', async ({ page }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });

    await page.locator('.analysis-title-menu-toggle').click();
    await sourcesItem(page).click();

    await expect(toastMessage(page)).toHaveText('the RRD files could not be exported, check they are still where this analysis opened them from');
  });

  test('Escape closes the analysis menu and nothing under it: the insights panel stays open on its expanded finding until the next Escape', async ({
    page,
  }) => {
    await seedWorkspace(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await runInsights(page);
    await expect(page.locator('.finding-card-detail')).toHaveCount(1);

    await menuToggle(page).click();
    await expect(sourcesItem(page)).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(sourcesItem(page)).toHaveCount(0);
    await expect(menuToggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(insightsPanel(page)).toBeVisible();
    await expect(page.locator('.finding-card-detail')).toHaveCount(1);

    await page.keyboard.press('Escape');

    await expect(page.locator('.finding-card-detail')).toHaveCount(0);
    await expect(insightsPanel(page)).toBeVisible();
  });
});
