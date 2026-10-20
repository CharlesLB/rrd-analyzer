import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { canvasOf, failRequests, holdAnswers, openLibrary, resetLibrary, seedAnalysis, toast, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import { accessOnAnEarlierDay, analysisRow, analysisRowNames, analysisRows } from '../support/library';
import { MISSING_SOURCE } from '../support/rrd-fixtures';
import { analysisTitleName, backToLibrary } from '../support/workspace';

const MINUTE_IN_HOURS = 1 / 60;
const ANALYSES_LISTING = '**/api/analyses';

const isAnalysisDeletion = (response: Response): boolean => response.request().method() === 'DELETE' && response.url().includes('/api/analyses/');

const deleteButtonOf = (page: Page, name: string): Locator => page.locator('app-analysis-row').filter({ hasText: name }).locator('.analysis-row-delete');

const accessOf = (page: Page, name: string): Locator => analysisRow(page, name).locator('.analysis-row-access');

const isAnalysesListing = (response: Response): boolean => response.url().endsWith('/api/analyses') && response.request().method() === 'GET';

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('library', () => {
  test('library row of an analysis whose file was deleted from the disk says so before the analysis is opened', async ({ page }) => {
    await seedAnalysis(page, { name: 'Deleted source', files: [MISSING_SOURCE], canvas: [{ seriesId: 's0', label: 'deleted_since' }] });
    await seedAnalysis(page, { name: 'Still here', canvas: canvasOf('s3') });

    await openLibrary(page);

    await expect(analysisRow(page, 'Deleted source').locator('.analysis-row-missing')).toHaveText('! 1 file missing');
    await expect(analysisRow(page, 'Deleted source').locator('.analysis-row-missing')).toHaveAttribute(
      'title',
      'No longer where the analysis read them: deleted_since.xml',
    );
    await expect(analysisRow(page, 'Still here').locator('.analysis-row-missing')).toHaveCount(0);
  });

  test('library on a first run lists no analyses and offers only the new analysis card', async ({ page }) => {
    await openLibrary(page);

    await expect(page.locator('.library-top-bar-title')).toHaveText('RRD Analyzer');
    await expect(page.locator('.new-analysis-card-title')).toHaveText('New analysis');
    await expect(page.locator('.new-analysis-card-subtitle')).toHaveText('Start with an empty canvas and pick charts from the library.');
    await expect(page.locator('.new-analysis-card-action')).toHaveText('Create');
    await expect(page.locator('.library-caption')).toHaveText('Previous analyses');
    await expect(analysisRows(page)).toHaveCount(0);
    await expect(page.locator('.library-note')).toHaveText('No analyses yet. Create one to start charting.');
    await expect(page.locator('.library-filter')).toHaveCount(0);
  });

  test('library the daemon cannot list says it could not be read, and still offers a new analysis', async ({ page }) => {
    await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await failRequests(page, '**/api/analyses', 'GET');

    await openLibrary(page);

    await expect(page.locator('.library-failure-message')).toHaveText('The library could not be read.');
    await expect(analysisRows(page)).toHaveCount(0);
    await expect(page.locator('.library-note')).toHaveCount(0);
    await expect(page.locator('.new-analysis-card-action')).toBeVisible();
  });

  test('library that could not be read is read again from Try again, and lists its analyses once the daemon answers', async ({ page }) => {
    await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5') });
    await failRequests(page, ANALYSES_LISTING, 'GET');
    await openLibrary(page);
    await expect(page.locator('.library-failure-retry')).toHaveText('Try again');

    await page.unroute(ANALYSES_LISTING);
    await page.locator('.library-failure-retry').click();

    await expect(analysisRowNames(page)).toHaveText(['Atlas prod · capacity']);
    await expect(page.locator('.library-failure')).toHaveCount(0);
  });

  test('library long enough to need it offers a filter by name, which says when no analysis matches', async ({ page }) => {
    const names = ['Atlas capacity', 'Atlas latency', 'HTTP review', 'Disk growth', 'Network egress', 'Cache hit rate', 'Queue depth', 'GC pauses'];
    await names.reduce(async (previous, name) => {
      await previous;
      await seedAnalysis(page, { name });
    }, Promise.resolve());
    await openLibrary(page);

    await page.locator('.library-filter input').fill(' atlas ');

    await expect(analysisRows(page)).toHaveCount(2);
    await expect(analysisRow(page, 'Atlas capacity')).toBeVisible();
    await expect(analysisRow(page, 'Atlas latency')).toBeVisible();

    await page.locator('.library-filter input').fill('postgres');

    await expect(analysisRows(page)).toHaveCount(0);
    await expect(page.locator('.library-note')).toHaveText('No analyses match.');
  });

  test('library filter clears from its X and offers the filters typed before, even after the page is opened again', async ({ page }) => {
    const names = ['Atlas capacity', 'Atlas latency', 'HTTP review', 'Disk growth', 'Network egress', 'Cache hit rate', 'Queue depth', 'GC pauses'];
    await names.reduce(async (previous, name) => {
      await previous;
      await seedAnalysis(page, { name });
    }, Promise.resolve());
    await openLibrary(page);
    const filter = page.locator('.library-filter input');

    await filter.fill('atlas');
    await filter.press('Enter');
    await filter.fill('disk');
    await page.locator('.library-filter .search-field-clear').click();

    await expect(filter).toHaveValue('');
    await expect(analysisRows(page)).toHaveCount(names.length);

    await filter.blur();
    await openLibrary(page);
    await filter.focus();

    await expect(page.locator('.search-field-history-term')).toHaveText(['atlas']);

    await filter.press('ArrowDown');
    await filter.press('Enter');

    await expect(filter).toHaveValue('atlas');
    await expect(analysisRows(page)).toHaveCount(2);
  });

  test('library with saved analyses lists each with its chart count, labels, relative access and an Open link', async ({ page }) => {
    await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3', 's5'), accessedHoursAgo: 2.5 });
    await seedAnalysis(page, { name: 'HTTP latency review', canvas: canvasOf('s8', 's9'), accessedHoursAgo: 30 });
    await seedAnalysis(page, { name: 'Network throughput', canvas: canvasOf('s6', 's7', 's0'), accessedHoursAgo: 84 });

    await openLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['Atlas prod · capacity', 'HTTP latency review', 'Network throughput']);
    await expect(page.locator('.analysis-row-meta')).toHaveText([
      '2 charts · system_cpu_user, system_memory_used',
      '2 charts · http_requests_rate, http_latency_p95',
      '3 charts · system_network_packets_sent, system_network_packets_recv, runtime_goroutines',
    ]);
    await expect(page.locator('.analysis-row-access')).toHaveText(['opened 2 h ago', accessOnAnEarlierDay(30), accessOnAnEarlierDay(84)]);
    await expect(page.locator('.analysis-row-open')).toHaveText(['Open', 'Open', 'Open']);
  });

  test('library row access reads just now, minutes and hours on each side of their boundaries, then the calendar days gone by, and just now for a future access', async ({
    page,
  }) => {
    const accessedHoursAgo = [-3, 0.5 * MINUTE_IN_HOURS, 1.5 * MINUTE_IN_HOURS, 59.5 * MINUTE_IN_HOURS, 61 * MINUTE_IN_HOURS, 23.9, 24.1, 47.9, 48.1, 720];
    await accessedHoursAgo.reduce(async (previous, hoursAgo, index) => {
      await previous;
      await seedAnalysis(page, { name: `Analysis ${index}`, accessedHoursAgo: hoursAgo });
    }, Promise.resolve());

    await openLibrary(page);

    await expect(page.locator('.analysis-row-access')).toHaveText([
      'opened just now',
      'opened just now',
      'opened 1 min ago',
      'opened 59 min ago',
      'opened 1 h ago',
      'opened 23 h ago',
      accessOnAnEarlierDay(24.1),
      accessOnAnEarlierDay(47.9),
      accessOnAnEarlierDay(48.1),
      accessOnAnEarlierDay(720),
    ]);
  });

  test('library lists analyses most recently opened first, whatever order they were created in', async ({ page }) => {
    await seedAnalysis(page, { name: 'Opened last week', accessedHoursAgo: 168 });
    await seedAnalysis(page, { name: 'Opened a moment ago', accessedHoursAgo: 0 });
    await seedAnalysis(page, { name: 'Opened yesterday', accessedHoursAgo: 30 });

    await openLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['Opened a moment ago', 'Opened yesterday', 'Opened last week']);
  });

  test('library row with an empty canvas reads 0 charts without a label list', async ({ page }) => {
    await seedAnalysis(page, { name: 'Nothing plotted yet' });

    await openLibrary(page);

    await expect(page.locator('.analysis-row-meta')).toHaveText(['0 charts']);
  });

  test('library row renders an analysis name holding markup as plain text rather than as elements', async ({ page }) => {
    const markupName = '<img src=x onerror="document.title=\'pwned\'"> & <b>bold</b>';
    await seedAnalysis(page, { name: markupName });

    await openLibrary(page);

    await expect(analysisRowNames(page)).toHaveText([markupName]);
    await expect(page.locator('.analysis-row-name img, .analysis-row-name b')).toHaveCount(0);
    await expect(page).toHaveTitle('RRD Analyzer');
  });

  test('deleting an analysis row with × takes it off the list at once, and for good once its toast is dismissed', async ({ page }) => {
    await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await seedAnalysis(page, { name: 'HTTP latency review', canvas: canvasOf('s9') });
    await openLibrary(page);

    await deleteButtonOf(page, 'Atlas prod · capacity').click();

    await expect(toastMessage(page)).toHaveText('analysis deleted');
    await expect(toast(page).locator('.toast-action')).toHaveText('Undo');
    await expect(analysisRowNames(page)).toHaveText(['HTTP latency review']);

    const deleted = page.waitForResponse(isAnalysisDeletion);
    await page.getByRole('button', { name: 'dismiss', exact: true }).click();
    await deleted;
    await openLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['HTTP latency review']);
  });

  test('deleting an analysis row and pressing Undo on its toast brings the row back, and nothing is deleted', async ({ page }) => {
    await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await openLibrary(page);

    await deleteButtonOf(page, 'Atlas prod · capacity').click();
    await expect(analysisRows(page)).toHaveCount(0);
    await toast(page).locator('.toast-action').click();

    await expect(analysisRowNames(page)).toHaveText(['Atlas prod · capacity']);

    await openLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['Atlas prod · capacity']);
  });

  test('deleting an analysis row and leaving the library before its toast goes still deletes it', async ({ page }) => {
    await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await seedAnalysis(page, { name: 'HTTP latency review', canvas: canvasOf('s9') });
    await openLibrary(page);

    await deleteButtonOf(page, 'Atlas prod · capacity').click();
    const deleted = page.waitForResponse(isAnalysisDeletion);
    await analysisRow(page, 'HTTP latency review').click();
    await deleted;
    await backToLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['HTTP latency review']);
  });

  test('an analysis row keeps its delete button beside it, named for what it does, and never inside the row that opens it', async ({ page }) => {
    await seedAnalysis(page, { name: 'Atlas prod · capacity', canvas: canvasOf('s3') });
    await openLibrary(page);

    await expect(page.getByRole('button', { name: 'delete analysis', exact: true })).toBeVisible();
    await expect(analysisRows(page).locator('button')).toHaveCount(0);
  });

  test('deleting the only analysis with × stays on the library, without opening it, and leaves no rows', async ({ page }) => {
    await seedAnalysis(page, { name: 'Last one standing', canvas: canvasOf('s3') });
    await openLibrary(page);

    await page.locator('.analysis-row-delete').click();

    await expect(analysisRows(page)).toHaveCount(0);
    await expect(page).toHaveURL('/#/');
    await expect(page.locator('.timeframe-bar')).toHaveCount(0);
  });

  test('toast from a deletion goes away on its own after a few seconds, and the analysis is deleted then', async ({ page }) => {
    await seedAnalysis(page, { name: 'Short-lived' });
    await openLibrary(page);
    const deleted = page.waitForResponse(isAnalysisDeletion);

    await page.locator('.analysis-row-delete').click();

    await expect(toastMessage(page)).toHaveText('analysis deleted');
    await expect(toast(page)).toHaveCount(0, { timeout: 8000 });
    await deleted;
  });

  test('opening an analysis row shows its workspace, and ‹ brings the library back with the access time refreshed', async ({ page }) => {
    const analysisId = await seedAnalysis(page, { name: 'Network throughput', canvas: canvasOf('s6'), accessedHoursAgo: 84 });
    await openLibrary(page);
    await expect(page.locator('.analysis-row-access')).toHaveText([accessOnAnEarlierDay(84)]);

    await page.locator('.analysis-row-open').click();

    await expect(page).toHaveURL(`/#/workspace/${analysisId}`);
    await expect(analysisTitleName(page)).toHaveText('Network throughput');
    await expect(page.locator('.chart-panel-header-title')).toHaveText(['atlas_system_network_packets_sent']);

    await backToLibrary(page);

    await expect(page).toHaveURL('/#/');
    await expect(analysisRowNames(page)).toHaveText(['Network throughput']);
    await expect(page.locator('.analysis-row-access')).toHaveText(['opened just now']);
  });

  test('clicking anywhere on an analysis row opens it, and only that analysis has its access time refreshed', async ({ page }) => {
    await seedAnalysis(page, { name: 'Left untouched', accessedHoursAgo: 84 });
    const openedId = await seedAnalysis(page, { name: 'Opened from its name', canvas: canvasOf('s0'), accessedHoursAgo: 30 });
    await openLibrary(page);

    await analysisRowNames(page).filter({ hasText: 'Opened from its name' }).click();

    await expect(page).toHaveURL(`/#/workspace/${openedId}`);
    await expect(page.locator('.chart-panel-header-title')).toHaveText(['atlas_runtime_goroutines']);

    await page.goBack();

    await expect(page).toHaveURL('/#/');
    await expect(accessOf(page, 'Left untouched')).toHaveText(accessOnAnEarlierDay(84));
    await expect(accessOf(page, 'Opened from its name')).toHaveText('opened just now');
  });

  test('an analysis row given the focus opens its workspace on Enter, and on Space, as a button would', async ({ page }) => {
    const analysisId = await seedAnalysis(page, { name: 'Keyboard only', canvas: canvasOf('s3') });
    await openLibrary(page);
    const row = analysisRows(page);

    await expect(row).toHaveAttribute('role', 'button');

    await row.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(`/#/workspace/${analysisId}`);

    await backToLibrary(page);
    await analysisRows(page).focus();
    await page.keyboard.press('Space');

    await expect(page).toHaveURL(`/#/workspace/${analysisId}`);
  });

  test('an analysis deleted while the library is still being read again stays deleted once that older list arrives', async ({ page }) => {
    await seedAnalysis(page, { name: 'Kept', canvas: canvasOf('s3') });
    await seedAnalysis(page, { name: 'Deleted meanwhile', canvas: canvasOf('s5') });
    await openLibrary(page);
    await analysisRowNames(page).filter({ hasText: 'Kept' }).click();
    await expect(analysisTitleName(page)).toHaveText('Kept');
    const releaseListing = await holdAnswers(page, ANALYSES_LISTING, 'GET');

    await backToLibrary(page);
    await deleteButtonOf(page, 'Deleted meanwhile').click();
    await expect(toastMessage(page)).toHaveText('analysis deleted');
    const staleListing = page.waitForResponse(isAnalysesListing);
    releaseListing();
    await staleListing;

    await expect(analysisRowNames(page)).toHaveText(['Kept']);
  });

  test('an analysis renamed in its workspace shows the new name in the library at once, before the library is read again', async ({ page }) => {
    await seedAnalysis(page, { name: 'Old name', canvas: canvasOf('s3') });
    await openLibrary(page);
    await analysisRows(page).click();
    await analysisTitleName(page).click();
    await page.locator('.analysis-title-input').fill('New name');
    await page.locator('.analysis-title-input').press('Enter');
    await expect(analysisTitleName(page)).toHaveText('New name');
    const releaseListing = await holdAnswers(page, ANALYSES_LISTING, 'GET');

    await backToLibrary(page);

    await expect(analysisRowNames(page)).toHaveText(['New name']);

    releaseListing();

    await expect(analysisRowNames(page)).toHaveText(['New name']);
  });

  test('document title names the library, then the analysis workspace once one is opened', async ({ page }) => {
    await seedAnalysis(page, { name: 'Titled', canvas: canvasOf('s3') });
    await openLibrary(page);
    await expect(page).toHaveTitle('RRD Analyzer');

    await page.locator('.analysis-row-open').click();

    await expect(page).toHaveTitle('Analysis · RRD Analyzer');
  });

  test('unknown route falls back to the library', async ({ page }) => {
    await page.goto('/#/no/such/screen');

    await expect(page).toHaveURL('/#/');
    await expect(page.locator('.new-analysis-card')).toBeVisible();
  });

  test('workspace route without an analysis id falls back to the library instead of a blank screen', async ({ page }) => {
    await page.goto('/#/workspace');

    await expect(page).toHaveURL('/#/');
    await expect(page.locator('.new-analysis-card')).toBeVisible({ timeout: 3000 });
  });

  test('theme toggle switches the app to the dark theme and keeps it across a reload', async ({ page }) => {
    await openLibrary(page);
    await expect(page.locator('.app-shell')).not.toHaveClass(/dark/);

    await page.locator('.theme-toggle').click();

    await expect(page.locator('.app-shell')).toHaveClass(/dark/);

    await page.reload();

    await expect(page.locator('.app-shell')).toHaveClass(/dark/);
    await expect(page.locator('.new-analysis-card')).toBeVisible();
  });

  test('theme toggled twice returns to the light theme and keeps light across a reload', async ({ page }) => {
    await openLibrary(page);

    await page.locator('.theme-toggle').click();
    await page.locator('.theme-toggle').click();
    await page.reload();

    await expect(page.locator('.new-analysis-card')).toBeVisible();
    await expect(page.locator('.app-shell')).not.toHaveClass(/dark/);
  });

  test('dark theme chosen on the library carries into a workspace, where its own toggle switches back to light', async ({ page }) => {
    await seedAnalysis(page, { name: 'Dark room', canvas: canvasOf('s3') });
    await openLibrary(page);
    await page.locator('.theme-toggle').click();

    await page.locator('.analysis-row-open').click();

    await expect(analysisTitleName(page)).toHaveText('Dark room');
    await expect(page.locator('.app-shell')).toHaveClass(/dark/);

    await page.locator('.timeframe-bar .theme-toggle').click();

    await expect(page.locator('.app-shell')).not.toHaveClass(/dark/);
  });
});
