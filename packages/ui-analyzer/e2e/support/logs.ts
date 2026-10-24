import { expect, type Locator, type Page } from '@playwright/test';

const MINUTE_MILLISECONDS = 60_000;
const JSON_MEDIA_TYPE = 'application/json';
const DAY_MINUTES = 1440;

export const REFERENCE_DATA_END = Date.parse('2026-08-29T15:00:00-03:00');

type LogFile = {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
};

type SeededEntry = readonly [minutesAgo: number, level: string, message: string, code: string];

const REFERENCE_ENTRIES: readonly SeededEntry[] = [
  [1380, 'info', 'Scrape completed for 10 targets', 'SCRAPE_OK'],
  [1290, 'debug', 'Cache miss for series lookup', 'CACHE_MISS'],
  [1200, 'info', 'Config reloaded', 'CFG_RELOAD'],
  [1110, 'warn', 'Slow request exceeded 300 ms budget', 'HTTP_SLOW'],
  [1020, 'info', 'Health check passed', 'HEALTH_OK'],
  [930, 'debug', 'Flushing 512 samples to disk', 'FLUSH'],
  [840, 'warn', 'Heap usage at 84% of limit', 'MEM_PRESSURE'],
  [750, 'error', 'Allocation failed: cannot reserve 256 MiB for series buffer', 'ALLOC_FAIL'],
  [740, 'fatal', 'OOMKilled: process exceeded memory limit (8 GiB)', 'OOM_KILLED'],
  [660, 'info', 'Process restarted, replaying write-ahead log', 'RESTART'],
  [570, 'info', 'Rotated write-ahead log segment', 'WAL_ROTATE'],
  [480, 'error', 'Upstream 503 from atlas-store', 'UPSTREAM_503'],
  [479, 'error', 'Upstream 503 from atlas-store', 'UPSTREAM_503'],
  [390, 'info', 'Compaction finished for block 01J8', 'COMPACT_OK'],
  [300, 'warn', 'Retrying upstream connection', 'UPSTREAM_RETRY'],
  [210, 'info', 'Health check passed', 'HEALTH_OK'],
  [120, 'debug', 'GC cycle completed', 'GC_DONE'],
  [60, 'info', 'Scrape completed for 10 targets', 'SCRAPE_OK'],
];

export const REFERENCE_LOG_COUNT = REFERENCE_ENTRIES.length;

const recordOf = ([minutesAgo, level, message, code]: SeededEntry, index: number, now: number) => ({
  '@timestamp': new Date(now - minutesAgo * MINUTE_MILLISECONDS).toISOString(),
  lvl: level,
  service: 'atlas-api',
  host: `atlas-prod-0${(index % 3) + 1}`,
  event: { msg: message, code },
  ctx: { trace_id: `trace-${index}`, route: '/v1/query', attempt: index },
});

export const logFileOf = (name: string, content: string): LogFile => ({ name, mimeType: JSON_MEDIA_TYPE, buffer: Buffer.from(content) });

export const logFileEndingAt = (endMilliseconds: number, name = 'atlas-api-logs.json'): LogFile =>
  logFileOf(name, JSON.stringify(REFERENCE_ENTRIES.map((entry, index) => recordOf(entry, index, endMilliseconds))));

export const referenceLogFile = (name?: string): LogFile => logFileEndingAt(REFERENCE_DATA_END, name);

export const logFileDaysBeforeTheEnd = (days: number): LogFile => logFileEndingAt(REFERENCE_DATA_END - days * DAY_MINUTES * MINUTE_MILLISECONDS);

export const addLogsButton = (page: Page): Locator => page.getByRole('button', { name: 'Add logs' });

export const logsSwitch = (page: Page): Locator => page.getByRole('switch', { name: 'Logs' });

export const logSetupPanel = (page: Page): Locator => page.locator('.log-setup-panel');

export const logDetailPanel = (page: Page): Locator => page.locator('.log-detail-panel');

export const logTrack = (page: Page): Locator => page.locator('.log-track');

export const logMarkers = (page: Page): Locator => page.locator('.log-track-marker');

export const logLanes = (page: Page): Locator => page.locator('.log-track-lane');

export const typeChips = (page: Page): Locator => page.locator('.log-type-chips-chip');

export const fieldRow = (page: Page, role: string): Locator => page.locator('.log-field-row').filter({ has: page.getByText(role, { exact: true }) });

export const jsonLines = (page: Page): Locator => page.locator('.json-viewer-line');

export const searchField = (page: Page): Locator => page.getByRole('combobox', { name: 'Find in JSON' });

export const chooseLogFile = async (page: Page, trigger: Locator, file: LogFile): Promise<void> => {
  const chooser = page.waitForEvent('filechooser');

  await trigger.click();
  await (await chooser).setFiles(file);
};

export const addLogs = async (page: Page, file: LogFile): Promise<void> => {
  await chooseLogFile(page, addLogsButton(page), file);
};

export const showReferenceLogs = async (page: Page): Promise<void> => {
  await addLogs(page, referenceLogFile());
  await logSetupPanel(page).getByRole('button', { name: 'Show logs' }).click();
  await expect(logSetupPanel(page)).toHaveCount(0);
  await expect(logMarkers(page).first()).toBeVisible();
};

export const markerOf = (page: Page, type: string, position = 0): Locator => page.locator(`.log-track-lane[title="${type}"] .log-track-marker`).nth(position);
