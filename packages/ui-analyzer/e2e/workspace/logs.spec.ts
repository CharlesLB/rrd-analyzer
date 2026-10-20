import { expect } from '@playwright/test';
import { canvasOf, resetLibrary, seedWorkspace, toastMessage } from '../support/analyzer';
import { test } from '../support/fixtures';
import {
  addLogs,
  addLogsButton,
  chooseLogFile,
  fieldRow,
  jsonLines,
  logDetailPanel,
  logFileDaysBeforeTheEnd,
  logFileEndingAt,
  logFileOf,
  logLanes,
  logMarkers,
  logSetupPanel,
  logsSwitch,
  logTrack,
  markerOf,
  REFERENCE_DATA_END,
  REFERENCE_LOG_COUNT,
  referenceLogFile,
  searchField,
  showReferenceLogs,
  typeChips,
} from '../support/logs';

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
  await seedWorkspace(page, { name: 'Logs', canvas: canvasOf('s3', 's5') });
});

test.describe('logs', () => {
  test('a log file is parsed, its fields are detected, and its entries land on a track under the charts', async ({ page }) => {
    await expect(addLogsButton(page)).toBeVisible();

    await addLogs(page, referenceLogFile());

    await expect(toastMessage(page)).toHaveText('18 entries parsed · 9 fields found');
    await expect(fieldRow(page, 'Timestamp').locator('.log-field-row-path')).toHaveText('@timestamp');
    await expect(fieldRow(page, 'Type').locator('.log-field-row-path')).toHaveText('lvl');
    await expect(fieldRow(page, 'Message').locator('.log-field-row-path')).toHaveText('event.msg');
    await expect(page.locator('.log-field-row-detected')).toHaveCount(3);
    await expect(fieldRow(page, 'Type').locator('.log-field-row-note')).toContainText('5 types: fatal, error, warn, info, debug');
    await expect(logTrack(page).locator('.log-track-notice')).toContainText('Map the timestamp, type and message fields to place 18 entries');

    await logSetupPanel(page).getByRole('button', { name: 'Show logs' }).click();

    await expect(logSetupPanel(page)).toHaveCount(0);
    await expect(logsSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.logs-trigger-count')).toHaveText(`${REFERENCE_LOG_COUNT}`);
    await expect(logLanes(page)).toHaveCount(5);
    await expect(typeChips(page).locator('.log-type-chips-chip-name')).toHaveText(['fatal', 'error', 'warn', 'info', 'debug']);
    await expect(logTrack(page).locator('.log-track-in-view')).toHaveText('18 in view');
    await expect(logMarkers(page)).toHaveCount(17);
  });

  test('a file that is not JSON says near which line, in the setup and on the track, and another file can replace it', async ({ page }) => {
    await addLogs(page, logFileOf('broken-export.json', '[\n  {"lvl": "info" "msg": "x"}\n]'));

    await expect(page.locator('.log-setup-failure-title')).toHaveText("This file isn't valid JSON near line 2.");
    await expect(page.locator('.log-setup-failure-file')).toHaveText('broken-export.json');
    await expect(logTrack(page).locator('.log-track-notice')).toContainText("Couldn't load broken-export.json — This file isn't valid JSON near line 2.");

    await logSetupPanel(page).getByRole('button', { name: 'close (esc)' }).click();
    await logTrack(page).getByRole('button', { name: 'Details' }).click();

    await expect(page.locator('.log-setup-failure-card')).toBeVisible();

    await chooseLogFile(page, logSetupPanel(page).getByRole('button', { name: 'Choose another file' }), referenceLogFile());

    await expect(fieldRow(page, 'Timestamp').locator('.log-field-row-path')).toHaveText('@timestamp');
  });

  test('a plain text .log is read as logs, its dates, levels and messages found without help', async ({ page }) => {
    const timeOf = (minutesBeforeTheEnd: number): string => new Date(REFERENCE_DATA_END - minutesBeforeTheEnd * 60_000).toISOString();

    const textLog = [
      `${timeOf(300)} INFO service started`,
      `${timeOf(200)} ERROR request failed`,
      '    at handler (api.js:12)',
      `${timeOf(100)} WARN slow query`,
    ].join('\n');

    await addLogs(page, logFileOf('service.log', textLog));

    await expect(logSetupPanel(page).locator('.log-file-summary-badge')).toHaveText('TEXT');
    await expect(fieldRow(page, 'Timestamp').locator('.log-field-row-path')).toHaveText('timestamp');
    await expect(fieldRow(page, 'Type').locator('.log-field-row-path')).toHaveText('level');
    await logSetupPanel(page).getByRole('button', { name: 'Show logs' }).click();

    await expect(logMarkers(page)).toHaveCount(3);
  });

  test('a .csv is read as logs, one entry per row under its header, a quoted cell keeping its comma', async ({ page }) => {
    const timeOf = (minutesBeforeTheEnd: number): string => new Date(REFERENCE_DATA_END - minutesBeforeTheEnd * 60_000).toISOString();
    const csvLog = ['time,level,message', `${timeOf(250)},info,"cache warmed, 12 keys"`, `${timeOf(150)},error,disk full`].join('\n');

    await addLogs(page, logFileOf('export.csv', csvLog));

    await expect(logSetupPanel(page).locator('.log-file-summary-badge')).toHaveText('CSV');
    await expect(fieldRow(page, 'Timestamp').locator('.log-field-row-path')).toHaveText('time');
    await logSetupPanel(page).getByRole('button', { name: 'Show logs' }).click();

    await expect(logMarkers(page)).toHaveCount(2);

    await markerOf(page, 'info').hover();

    await expect(page.locator('.log-track-tip-message')).toHaveText('cache warmed, 12 keys');
  });

  test('a field that reads like an identifier cannot be the type, and one line per object is read as well', async ({ page }) => {
    const lines = Array.from({ length: 30 }, (_unused, index) =>
      JSON.stringify({
        time: new Date(REFERENCE_DATA_END - (index + 1) * 600_000).toISOString(),
        level: 'info',
        message: `entry ${index}`,
        trace: `trace-${index}`,
      }),
    );

    await addLogs(page, logFileOf('service.ndjson', lines.join('\n')));
    await fieldRow(page, 'Type').getByRole('button', { name: 'Type' }).click();
    await fieldRow(page, 'Type')
      .getByRole('option', { name: /^trace/ })
      .click();

    await expect(fieldRow(page, 'Type').locator('.log-field-row-note')).toHaveText('!“trace” has 30 distinct values — that looks like an ID, not a log type.');
    await expect(logSetupPanel(page).getByRole('button', { name: 'Show logs' })).toBeDisabled();

    await fieldRow(page, 'Type').getByRole('button', { name: 'Type' }).click();
    await fieldRow(page, 'Type')
      .getByRole('option', { name: /^level/ })
      .click();

    await expect(logSetupPanel(page).getByRole('button', { name: 'Show logs' })).toBeEnabled();
  });

  test('hovering a marker shows its entry above the lanes and marks every chart at that time', async ({ page }) => {
    await showReferenceLogs(page);

    await markerOf(page, 'fatal').hover();

    await expect(page.locator('.log-track-tip-type')).toHaveText('fatal');
    await expect(page.locator('.log-track-tip-message')).toHaveText('OOMKilled: process exceeded memory limit (8 GiB)');
    await expect(page.locator('.plot-drawing-log-mark')).toHaveCount(2);

    await markerOf(page, 'error', 1).hover();

    await expect(page.locator('.log-track-tip-more')).toHaveText('+1 more here · click, then step with ‹ ›');
  });

  test('clicking a marker opens the entry with its original JSON, and the arrows step through the entries', async ({ page }) => {
    await showReferenceLogs(page);

    await markerOf(page, 'fatal').click();

    await expect(logDetailPanel(page).locator('.log-detail-panel-badge-type')).toHaveText('fatal');
    await expect(logDetailPanel(page).locator('.log-detail-panel-message')).toHaveText('OOMKilled: process exceeded memory limit (8 GiB)');
    await expect(logDetailPanel(page).locator('.log-detail-panel-position')).toHaveText('9 of 18');
    await expect(logDetailPanel(page).locator('.log-detail-panel-role')).toHaveText(['time ← @timestamp', 'type ← lvl', 'message ← event.msg']);
    await expect(jsonLines(page)).toHaveCount(15);
    await expect(jsonLines(page).nth(2)).toHaveText('3  "lvl": "fatal",');
    await expect(page.locator('.plot-drawing-log-mark-selected')).toHaveCount(2);

    await page.keyboard.press('ArrowLeft');

    await expect(logDetailPanel(page).locator('.log-detail-panel-position')).toHaveText('8 of 18');
    await expect(logDetailPanel(page).locator('.log-detail-panel-badge-type')).toHaveText('error');

    await logDetailPanel(page).getByRole('button', { name: 'next entry (→)' }).click();
    await page.keyboard.press('Escape');

    await expect(logDetailPanel(page)).toHaveCount(0);
    await expect(page.locator('.log-track-marker:focus')).toHaveCount(1);

    await page.locator('.log-track-marker:focus').blur();

    await expect(page.locator('.plot-drawing-log-mark')).toHaveCount(0);
  });

  test('searching the JSON highlights every match, steps through them and says when there is none', async ({ page }) => {
    await showReferenceLogs(page);
    await markerOf(page, 'error', 1).click();
    await expect(page.locator('.json-viewer-lines')).toBeVisible();

    await page.keyboard.press('Control+f');
    await searchField(page).fill('ATLAS');

    await expect(page.locator('.json-viewer-search-counter')).toHaveText('1 of 3');
    await expect(page.locator('.json-viewer-hit')).toHaveCount(3);
    await expect(page.locator('.json-viewer-hit-current')).toHaveCount(1);

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await expect(page.locator('.json-viewer-search-counter')).toHaveText('1 of 3');

    await page.keyboard.press('Shift+Enter');

    await expect(page.locator('.json-viewer-search-counter')).toHaveText('3 of 3');

    await searchField(page).fill('kafka');

    await expect(page.locator('.json-viewer-search-counter')).toHaveText('No results');

    await page.keyboard.press('Escape');

    await expect(searchField(page)).toHaveCount(0);
    await expect(page.locator('.json-viewer-hit')).toHaveCount(0);
    await expect(logDetailPanel(page)).toBeVisible();
  });

  test('a type hidden from its chip leaves the track and the entry count, and can be shown again', async ({ page }) => {
    await showReferenceLogs(page);

    await typeChips(page).filter({ hasText: 'info' }).click();

    await expect(logLanes(page)).toHaveCount(4);
    await expect(logTrack(page).locator('.log-track-in-view')).toHaveText('10 in view');

    await markerOf(page, 'fatal').click();

    await expect(logDetailPanel(page).locator('.log-detail-panel-position')).toHaveText('6 of 10');

    await page.keyboard.press('Escape');
    await typeChips(page).filter({ hasText: 'fatal' }).click();
    await typeChips(page).filter({ hasText: 'error' }).click();
    await typeChips(page).filter({ hasText: 'warn' }).click();
    await typeChips(page).filter({ hasText: 'debug' }).click();

    await expect(logTrack(page).locator('.log-track-notice')).toContainText('All log types are hidden.');

    await logTrack(page).getByRole('button', { name: 'Show all' }).click();

    await expect(logLanes(page)).toHaveCount(5);
  });

  test('a type recoloured in the setup changes its markers at once, and can be reset', async ({ page }) => {
    await showReferenceLogs(page);
    await logTrack(page).getByRole('button', { name: 'Fields & colors' }).click();

    await page.getByRole('button', { name: 'change the color of fatal' }).click();
    await page.getByRole('button', { name: '#2F9A84' }).click();

    await expect(markerOf(page, 'fatal').locator('.log-track-dot')).toHaveCSS('background-color', 'rgb(47, 154, 132)');
    await expect(logSetupPanel(page).getByRole('button', { name: 'Done' })).toBeVisible();

    await logSetupPanel(page).getByRole('button', { name: 'Reset to defaults' }).click();

    await expect(markerOf(page, 'fatal').locator('.log-track-dot')).toHaveCSS('background-color', 'rgb(142, 42, 34)');
  });

  test('the switch hides the track without losing the logs, and the bin removes them', async ({ page }) => {
    await showReferenceLogs(page);

    await logsSwitch(page).click();

    await expect(logTrack(page)).toHaveCount(0);
    await expect(logsSwitch(page)).toHaveAttribute('aria-checked', 'false');

    await logsSwitch(page).click();

    await expect(logMarkers(page)).toHaveCount(17);

    await page.getByRole('button', { name: 'remove logs' }).click();

    await expect(toastMessage(page)).toHaveText('atlas-api-logs.json removed');
    await expect(logTrack(page)).toHaveCount(0);
    await expect(addLogsButton(page)).toBeVisible();
  });

  test('all types share one row once the lanes are turned off in the view settings', async ({ page }) => {
    await showReferenceLogs(page);

    await page.getByLabel('view settings').click();
    await page.getByRole('menuitemcheckbox', { name: 'One lane per log type' }).click();
    await page.keyboard.press('Escape');

    await expect(logLanes(page)).toHaveCount(1);
    await expect(logMarkers(page)).toHaveCount(17);
  });

  test('logs that fall outside the window say where they are and offer to jump there', async ({ page }) => {
    await addLogs(page, logFileDaysBeforeTheEnd(3));
    await logSetupPanel(page).getByRole('button', { name: 'Show logs' }).click();

    await expect(logTrack(page).locator('.log-track-notice-text')).toHaveText('No log entries in this window.');
    await expect(logTrack(page).locator('.log-track-notice-detail')).toHaveText('Logs span 2026-08-25 16:00 → 2026-08-26 14:00');

    await logTrack(page).getByRole('button', { name: 'Jump to logs' }).click();

    await expect(logMarkers(page)).toHaveCount(18);
    await expect(logTrack(page).locator('.log-track-in-view')).toHaveText('18 in view');
  });

  test('logs dated after the RRD data ends say so and offer no jump', async ({ page }) => {
    await addLogs(page, logFileEndingAt(REFERENCE_DATA_END + 86_400_000 * 30));
    await logSetupPanel(page).getByRole('button', { name: 'Show logs' }).click();

    await expect(logTrack(page).locator('.log-track-notice-text')).toHaveText('These logs fall outside the RRD data range.');
    await expect(logTrack(page).getByRole('button', { name: 'Jump to logs' })).toHaveCount(0);
  });
});
