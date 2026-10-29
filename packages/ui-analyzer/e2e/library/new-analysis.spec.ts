import { expect } from '@playwright/test';
import { failRequests, holdAnswers, resetLibrary, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import { analysisRowNames, analysisRows } from '../support/library';
import {
  createButton,
  dragFilesAwayFromDropZone,
  dragFilesOverDropZone,
  dropFilesOnDropZone,
  dropZone,
  emptyDump,
  nameInput,
  newAnalysisDialog,
  openNewAnalysisDialog,
  pickSources,
  readinessHint,
  sourceCountLabel,
  sourceNames,
  sourceSizes,
} from '../support/new-analysis-dialog';
import { analysisTitleName, backToLibrary, chartLibraryCount } from '../support/workspace';

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;

const plainText = (name: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from('not a dump') });

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
  await openNewAnalysisDialog(page);
});

test.describe('new analysis dialog', () => {
  test('new analysis dialog opened from the card starts empty, with Create not yet ready and a hint asking for a source', async ({ page }) => {
    await expect(newAnalysisDialog(page).locator('.modal-dialog-title')).toHaveText('New analysis');
    await expect(newAnalysisDialog(page).locator('.modal-dialog-helper')).toHaveText('Files are read locally, so the originals are never modified.');
    await expect(page.locator('.new-analysis-dialog-label')).toHaveText(['Analysis name', 'RRD sources']);
    await expect(nameInput(page)).toHaveAttribute('placeholder', 'e.g. Orders API · production');
    await expect(page.locator('.source-drop-zone-title')).toHaveText('Drop .rrd or .xml files here');
    await expect(page.locator('.source-drop-zone-subtitle')).toHaveText('or click to browse, multiple files supported');
    await expect(page.locator('.pending-source-list-empty')).toHaveText('No files yet, and an analysis needs at least one source.');
    await expect(readinessHint(page)).toHaveText('Add at least one .rrd or .xml file');
    await expect(createButton(page)).not.toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('new analysis dialog asked to Create with no source creates nothing, points at the hint and moves the focus to the drop zone', async ({ page }) => {
    await createButton(page).click();

    await expect(newAnalysisDialog(page)).toBeVisible();
    await expect(readinessHint(page)).toHaveClass(/new-analysis-dialog-hint-missing/);
    await expect(dropZone(page)).toBeFocused();
    await expect(analysisRows(page)).toHaveCount(0);
  });

  test('new analysis dialog drop zone, and everything inside it, is where the desktop window hands over dropped files', async ({ page }) => {
    const dropTargetOf = async (selector: string): Promise<string> =>
      await page.locator(selector).evaluate((element) => getComputedStyle(element).getPropertyValue('--wails-drop-target').trim());

    expect(await dropTargetOf('.source-drop-zone')).toBe('drop');
    expect(await dropTargetOf('.source-drop-zone-title')).toBe('drop');
  });

  test('new analysis dialog given a file that is neither .rrd nor .xml refuses it with a toast', async ({ page }) => {
    await pickSources(page, [plainText('notes.txt')]);

    await expect(toastMessage(page)).toHaveText('Only .rrd or .xml dumps are supported');
    await expect(sourceNames(page)).toHaveCount(0);
    await expect(createButton(page)).not.toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('new analysis dialog given names that only resemble a dump, such as .rrd.bak, .xml.gz or a bare rrd, refuses all of them', async ({ page }) => {
    await pickSources(page, [plainText('atlas.rrd.bak'), plainText('atlas.xml.gz'), plainText('rrd'), plainText('atlas_rrd')]);

    await expect(toastMessage(page)).toHaveText('Only .rrd or .xml dumps are supported');
    await expect(sourceNames(page)).toHaveCount(0);
  });

  test('new analysis dialog given dumps with upper-case extensions takes them like lower-case ones', async ({ page }) => {
    await pickSources(page, [emptyDump('ATLAS_PROD.RRD', 2048), emptyDump('Replica.Xml', 1024)]);

    await expect(sourceNames(page)).toHaveText(['ATLAS_PROD.RRD', 'Replica.Xml']);
    await expect(createButton(page)).toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('new analysis dialog given dumps and other files in one pick keeps the dumps and says how many files it skipped', async ({ page }) => {
    await pickSources(page, [plainText('README.md'), emptyDump('atlas_prod.rrd', 2048), plainText('collector.log'), emptyDump('atlas_replica.xml', 4096)]);

    await expect(sourceNames(page)).toHaveText(['atlas_prod.rrd', 'atlas_replica.xml']);
    await expect(readinessHint(page)).toHaveText('2 sources ready');
    await expect(toastMessage(page)).toHaveText('2 files were skipped: only .rrd or .xml dumps are supported');
  });

  test('new analysis dialog given the same dump twice lists every source once, with its size, and makes Create ready', async ({ page }) => {
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048)]);
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048), emptyDump('atlas_replica.rrd', 4096)]);

    await expect(toastMessage(page)).toHaveText('1 file was already listed');
    await expect(sourceNames(page)).toHaveText(['atlas_prod.rrd', 'atlas_replica.rrd']);
    await expect(sourceSizes(page)).toHaveText(['2 KB', '4 KB']);
    await expect(sourceCountLabel(page)).toHaveText('2 files');
    await expect(readinessHint(page)).toHaveText('2 sources ready');
    await expect(createButton(page)).toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('new analysis dialog given two files of the same name in a single pick lists that name once', async ({ page }) => {
    await pickSources(page, [emptyDump('atlas_prod.rrd', 1024), emptyDump('atlas_prod.rrd', 2048)]);

    await expect(sourceNames(page)).toHaveText(['atlas_prod.rrd'], { timeout: 3000 });
  });

  test('new analysis dialog sizes sources in bytes below a kilobyte, rounded kilobytes below a megabyte and megabytes with one decimal above', async ({
    page,
  }) => {
    await pickSources(page, [
      emptyDump('empty.rrd', 0),
      emptyDump('just_under.rrd', KILOBYTE - 1),
      emptyDump('one_kilobyte.rrd', KILOBYTE),
      emptyDump('rounds_up.rrd', KILOBYTE + KILOBYTE / 2),
      emptyDump('just_under_a_megabyte.rrd', MEGABYTE - 1),
      emptyDump('large.rrd', MEGABYTE * 5.5),
    ]);

    await expect(sourceSizes(page)).toHaveText(['0 B', '1023 B', '1 KB', '2 KB', '1024 KB', '5.5 MB']);
  });

  test('new analysis dialog drops one source with its × and the rest with Remove all, back to the empty state', async ({ page }) => {
    await pickSources(page, [emptyDump('first.rrd', 1024), emptyDump('second.rrd', 2048)]);

    await page.locator('.pending-source-list-row-remove').first().click();

    await expect(sourceNames(page)).toHaveText(['second.rrd']);
    await expect(sourceCountLabel(page)).toHaveText('1 file');
    await expect(readinessHint(page)).toHaveText('1 source ready');

    await page.locator('.pending-source-list-clear').click();

    await expect(page.locator('.pending-source-list-empty')).toBeVisible();
    await expect(readinessHint(page)).toHaveText('Add at least one .rrd or .xml file');
    await expect(createButton(page)).not.toHaveClass(/new-analysis-dialog-create-ready/);
  });

  test('new analysis dialog removing the middle source keeps the others in the order they were picked', async ({ page }) => {
    await pickSources(page, [emptyDump('first.rrd', 1024), emptyDump('middle.rrd', 2048), emptyDump('last.rrd', 3072)]);

    await page.locator('.pending-source-list-row').filter({ hasText: 'middle.rrd' }).locator('.pending-source-list-row-remove').click();

    await expect(sourceNames(page)).toHaveText(['first.rrd', 'last.rrd']);
    await expect(sourceSizes(page)).toHaveText(['1 KB', '3 KB']);
  });

  test('new analysis dialog highlights the drop zone while files are dragged over it and clears it when they leave', async ({ page }) => {
    const files = [{ name: 'atlas_prod.rrd', size: 2048 }];

    await dropZone(page).dispatchEvent('dragenter');
    await dragFilesOverDropZone(page, files);

    await expect(dropZone(page)).toHaveClass(/source-drop-zone-active/);

    await dragFilesAwayFromDropZone(page, files);

    await expect(dropZone(page)).not.toHaveClass(/source-drop-zone-active/);
    await expect(sourceNames(page)).toHaveCount(0);
  });

  test('new analysis dialog given files dropped on the drop zone lists the dumps among them and clears the highlight', async ({ page }) => {
    const files = [
      { name: 'dropped_prod.rrd', size: 2048 },
      { name: 'notes.md', size: 12 },
      { name: 'dropped_replica.xml', size: 5120 },
    ];

    await dropZone(page).dispatchEvent('dragenter');
    await dragFilesOverDropZone(page, files);

    await dropFilesOnDropZone(page, files);

    await expect(toastMessage(page)).toHaveText('1 file was skipped: only .rrd or .xml dumps are supported');
    await expect(sourceNames(page)).toHaveText(['dropped_prod.rrd', 'dropped_replica.xml']);
    await expect(sourceSizes(page)).toHaveText(['2 KB', '5 KB']);
    await expect(dropZone(page)).not.toHaveClass(/source-drop-zone-active/);
  });

  test('new analysis dialog given only unsupported files dropped on the drop zone refuses them with a toast', async ({ page }) => {
    await dropFilesOnDropZone(page, [{ name: 'screenshot.png', size: 4096 }]);

    await expect(toastMessage(page)).toHaveText('Only .rrd or .xml dumps are supported');
    await expect(sourceNames(page)).toHaveCount(0);
  });

  test('Create analysis with a typed name opens the new, empty workspace under that name and lists it in the library', async ({ page }) => {
    await nameInput(page).fill('Atlas prod · capacity');
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048), emptyDump('atlas_replica.rrd', 4096)]);

    await createButton(page).click();

    await expect(page).toHaveURL(/#\/workspace\/[0-9a-f]+$/);
    await expect(newAnalysisDialog(page)).toHaveCount(0);
    await expect(analysisTitleName(page)).toHaveText('Atlas prod · capacity');
    await expect(chartLibraryCount(page)).toHaveText('10 of 10');
    await expect(page.locator('.chart-canvas-empty')).toContainText('Empty canvas.');

    await backToLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['Atlas prod · capacity']);
    await expect(page.locator('.analysis-row-meta')).toHaveText(/^0 charts/);
  });

  test('Create analysis with a name padded by spaces keeps the name without the padding', async ({ page }) => {
    await nameInput(page).fill('   Padded name   ');
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048)]);

    await createButton(page).click();

    await expect(analysisTitleName(page)).toHaveText('Padded name');
  });

  test('Create analysis without a name and a single source names the analysis after that file', async ({ page }) => {
    await pickSources(page, [emptyDump('atlas-prod.rrd', 2048)]);

    await createButton(page).click();

    await expect(analysisTitleName(page)).toHaveText('atlas-prod');
  });

  test('Create analysis with a name of only spaces and a single dotted source names it after the file, dropping only the last extension', async ({ page }) => {
    await nameInput(page).fill('     ');
    await pickSources(page, [emptyDump('atlas.prod.v2.rrd', 2048)]);

    await createButton(page).click();

    await expect(analysisTitleName(page)).toHaveText('atlas.prod.v2');
  });

  test('Create analysis without a name and several sources calls the analysis Untitled analysis', async ({ page }) => {
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048), emptyDump('atlas_replica.rrd', 4096)]);

    await createButton(page).click();

    await expect(analysisTitleName(page)).toHaveText('Untitled analysis');
  });

  test('Create analysis without a name from a source called only .rrd still gives the analysis a visible name', async ({ page }) => {
    await pickSources(page, [emptyDump('.rrd', 2048)]);

    await createButton(page).click();

    await expect(analysisTitleName(page)).not.toHaveText('', { timeout: 3000 });
  });

  test('Create analysis refused by the server says so, keeps the dialog open with its sources and creates nothing', async ({ page }) => {
    await nameInput(page).fill('Never stored');
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048)]);
    await failRequests(page, '**/api/analyses', 'POST');

    await createButton(page).click();

    await expect(toastMessage(page)).toHaveText('the analysis could not be created');
    await expect(newAnalysisDialog(page)).toBeVisible();
    await expect(sourceNames(page)).toHaveText(['atlas_prod.rrd']);
    await expect(page).toHaveURL('/#/');
    await expect(analysisRows(page)).toHaveCount(0);
  });

  test('new analysis dialog closes on Cancel, on × and on the scrim without creating anything', async ({ page }) => {
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048)]);

    await page.locator('.new-analysis-dialog-cancel').click();

    await expect(newAnalysisDialog(page)).toHaveCount(0);

    await page.locator('.new-analysis-card').click();
    await newAnalysisDialog(page).locator('.modal-dialog-close').click();

    await expect(newAnalysisDialog(page)).toHaveCount(0);

    await page.locator('.new-analysis-card').click();
    await newAnalysisDialog(page)
      .locator('.modal-dialog-scrim')
      .click({ position: { x: 8, y: 8 } });

    await expect(newAnalysisDialog(page)).toHaveCount(0);
    await expect(analysisRows(page)).toHaveCount(0);
  });

  test('new analysis dialog closed by Escape or the scrim reopens on the name and the sources it was left with', async ({ page }) => {
    await nameInput(page).fill('Half done');
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048)]);

    await page.keyboard.press('Escape');
    await expect(newAnalysisDialog(page)).toHaveCount(0);
    await page.locator('.new-analysis-card').click();

    await expect(nameInput(page)).toHaveValue('Half done');
    await expect(sourceNames(page)).toHaveText(['atlas_prod.rrd']);

    await newAnalysisDialog(page)
      .locator('.modal-dialog-scrim')
      .click({ position: { x: 8, y: 8 } });
    await page.locator('.new-analysis-card').click();

    await expect(nameInput(page)).toHaveValue('Half done');
    await expect(sourceNames(page)).toHaveText(['atlas_prod.rrd']);
  });

  test('new analysis dialog keeps Tab inside it, names its field with a label, and hands the focus back to the card when it closes', async ({ page }) => {
    await expect(page.getByLabel('Analysis name')).toBeFocused();

    await createButton(page).focus();
    await page.keyboard.press('Tab');

    await expect(newAnalysisDialog(page).locator('.modal-dialog-close')).toBeFocused();

    await page.keyboard.press('Shift+Tab');

    await expect(createButton(page)).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(page.locator('.new-analysis-card')).toBeFocused();
  });

  test('Create analysis says it is creating, and cannot be pressed again, until the daemon answers', async ({ page }) => {
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048)]);
    const releaseCreation = await holdAnswers(page, '**/api/analyses', 'POST');

    await createButton(page).click();

    await expect(createButton(page)).toHaveText('Creating…');
    await expect(createButton(page)).toBeDisabled();

    releaseCreation();

    await expect(analysisTitleName(page)).toHaveText('atlas_prod');
  });

  test('files dropped on the new analysis card open the dialog holding the dumps among them', async ({ page }) => {
    await page.locator('.new-analysis-dialog-cancel').click();

    const dropped = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();

      transfer.items.add(new File([new Uint8Array(2048)], 'dropped_prod.rrd'));
      transfer.items.add(new File([new Uint8Array(12)], 'notes.md'));

      return transfer;
    });

    await page.locator('.new-analysis-card').dispatchEvent('drop', { dataTransfer: dropped });

    await expect(newAnalysisDialog(page)).toBeVisible();
    await expect(sourceNames(page)).toHaveText(['dropped_prod.rrd']);
  });

  test('new analysis card, like the drop zone, is where the desktop window hands over dropped files', async ({ page }) => {
    await page.locator('.new-analysis-dialog-cancel').click();

    expect(await page.locator('.new-analysis-card-title').evaluate((element) => getComputedStyle(element).getPropertyValue('--wails-drop-target').trim())).toBe(
      'drop',
    );
  });

  test('new analysis dialog stays open when clicked inside, away from its buttons', async ({ page }) => {
    await newAnalysisDialog(page).locator('.modal-dialog-helper').click();
    await page.locator('.pending-source-list-empty').click();

    await expect(newAnalysisDialog(page)).toBeVisible();
  });

  test('new analysis dialog reopened after Cancel starts over with no name and no sources', async ({ page }) => {
    await nameInput(page).fill('Abandoned draft');
    await pickSources(page, [emptyDump('atlas_prod.rrd', 2048)]);
    await page.locator('.new-analysis-dialog-cancel').click();

    await page.locator('.new-analysis-card').click();

    await expect(nameInput(page)).toHaveValue('');
    await expect(sourceNames(page)).toHaveCount(0);
    await expect(createButton(page)).not.toHaveClass(/new-analysis-dialog-create-ready/);
  });
});
