import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test';
import { APP_DAEMON_URL, DAEMON_URL, daemonAddressed } from './daemon';
import { chartLibraryCount, drawnLines } from './workspace';

const ANALYSES_URL = `${APP_DAEMON_URL}/api/analyses`;
export const CHART_QUERY_PATH = '/api/chart';

const CANVAS_PATH_SUFFIX = '/canvas';
const LIBRARY_ORDER_PATH_SUFFIX = '/library-order';
const HOUR_MILLISECONDS = 3_600_000;
const REFERENCE_SOURCE_SIZE = 1024;

const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
} as const;

export type SourceFile = {
  readonly name: string;
  readonly path: string;
  readonly size: number;
};

export type ChartReference = {
  readonly seriesId: string;
  readonly label: string;
};

export type MergedSeriesSeed = ChartReference & {
  readonly axis: number;
};

export type CanvasChartSeed = ChartReference & {
  readonly merged?: readonly MergedSeriesSeed[];
};

export type AnalysisSeed = {
  readonly name: string;
  readonly files?: readonly SourceFile[];
  readonly canvas?: readonly CanvasChartSeed[];
  readonly accessedHoursAgo?: number;
};

export const REFERENCE_LABELS = {
  s0: 'runtime_goroutines',
  s1: 'runtime_gc_pause',
  s2: 'runtime_heap_objects',
  s3: 'system_cpu_user',
  s4: 'system_cpu_system',
  s5: 'system_memory_used',
  s6: 'system_network_packets_sent',
  s7: 'system_network_packets_recv',
  s8: 'http_requests_rate',
  s9: 'http_latency_p95',
} as const;

export type ReferenceSeriesId = keyof typeof REFERENCE_LABELS;

export const REFERENCE_FILES: readonly SourceFile[] = Object.values(REFERENCE_LABELS).map((label) => ({
  name: `atlas_${label}.rrd`,
  path: '',
  size: REFERENCE_SOURCE_SIZE,
}));

export const canvasOf = (...seriesIds: readonly ReferenceSeriesId[]): readonly ChartReference[] =>
  seriesIds.map((seriesId) => ({ seriesId, label: REFERENCE_LABELS[seriesId] }));

export const mergedChartOf = (seriesId: ReferenceSeriesId, ...merged: readonly (readonly [ReferenceSeriesId, number])[]): CanvasChartSeed => ({
  seriesId,
  label: REFERENCE_LABELS[seriesId],
  merged: merged.map(([mergedSeriesId, axis]) => ({ seriesId: mergedSeriesId, label: REFERENCE_LABELS[mergedSeriesId], axis })),
});

const identifierOf = (body: unknown): string => {
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }

  throw new Error('the dev API created an analysis without answering its id');
};

const SERVER_FAILURE_STATUS = 500;
const SERVER_FAILURE_BODY = 'the development server refused this request';
const BLANK_PAGE = 'about:blank';

const isAnalysisListing = (response: Response): boolean => response.url() === ANALYSES_URL && response.request().method() === HTTP_METHODS.GET;

const isCanvasSave = (response: Response): boolean => response.url().endsWith(CANVAS_PATH_SUFFIX) && response.request().method() === HTTP_METHODS.PUT;

const isLibraryOrderSave = (response: Response): boolean =>
  response.url().endsWith(LIBRARY_ORDER_PATH_SUFFIX) && response.request().method() === HTTP_METHODS.PUT;

export type RequestRecording = {
  readonly requests: readonly Request[];
  readonly stop: () => void;
};

export const isChartQuery = (request: Request): boolean => request.method() === HTTP_METHODS.POST && request.url().endsWith(CHART_QUERY_PATH);

export const recordChartQueries = (page: Page): RequestRecording => {
  const requests: Request[] = [];

  const recordChartQuery = (request: Request): void => {
    if (isChartQuery(request)) {
      requests.push(request);
    }
  };

  page.on('request', recordChartQuery);

  return { requests, stop: () => page.off('request', recordChartQuery) };
};

export const toast = (page: Page): Locator => page.locator('.toast');

export const toastMessage = (page: Page): Locator => toast(page).locator('.toast-message');

export const resetLibrary = async (page: Page): Promise<void> => {
  const response = await page.request.post(`${DAEMON_URL}/api/dev/reset`);

  expect(response.ok()).toBe(true);
};

export const seedAnalysis = async (page: Page, seed: AnalysisSeed): Promise<string> => {
  const response = await page.request.post(`${DAEMON_URL}/api/dev/analyses`, {
    data: {
      name: seed.name,
      files: seed.files ?? REFERENCE_FILES,
      canvas: seed.canvas ?? [],
      lastAccessedMilliseconds: Date.now() - (seed.accessedHoursAgo ?? 0) * HOUR_MILLISECONDS,
    },
  });

  expect(response.ok()).toBe(true);

  const body: unknown = await response.json();

  return identifierOf(body);
};

export const openLibrary = async (page: Page): Promise<void> => {
  await page.goto(BLANK_PAGE);

  const listing = page.waitForResponse(isAnalysisListing);

  await page.goto('/#/');
  await listing;
};

export const goToWorkspace = async (page: Page, analysisId: string): Promise<void> => {
  await page.goto(BLANK_PAGE);
  await page.goto(`/#/workspace/${analysisId}`);
};

export const failRequests = async (page: Page, urlPattern: string, method: string): Promise<void> => {
  await page.route(urlPattern, async (route) => {
    if (route.request().method() !== method) {
      await route.fallback();

      return;
    }

    await route.fulfill({ status: SERVER_FAILURE_STATUS, body: SERVER_FAILURE_BODY });
  });
};

type AnswerGate = {
  release: () => void;
};

export const holdAnswers = async (page: Page, urlPattern: string, method: string): Promise<() => void> => {
  const gate: AnswerGate = { release: () => undefined };

  const released = new Promise<void>((resolve) => {
    gate.release = () => resolve();
  });

  await page.route(urlPattern, async (route) => {
    if (route.request().method() !== method) {
      await route.fallback();

      return;
    }

    const answer = await route.fetch({ url: daemonAddressed(route.request().url()) });

    await released;
    await route.fulfill({ response: answer });
  });

  return () => gate.release();
};

export const openWorkspace = async (page: Page, analysisId: string, lineCount: number): Promise<void> => {
  await goToWorkspace(page, analysisId);
  await expect(chartLibraryCount(page)).toHaveText(/^\d+ of [1-9]\d*$/);
  await expect(page.locator('.library-thumbnail .sparkline-line').first()).toHaveAttribute('d', /^M/);
  await expect(drawnLines(page)).toHaveCount(lineCount);
};

const lineCountOf = (canvas: readonly CanvasChartSeed[]): number => canvas.reduce((count, chart) => count + 1 + (chart.merged?.length ?? 0), 0);

export const seedWorkspace = async (page: Page, seed: AnalysisSeed): Promise<string> => {
  const analysisId = await seedAnalysis(page, seed);

  await openWorkspace(page, analysisId, lineCountOf(seed.canvas ?? []));

  return analysisId;
};

export const waitForCanvasSave = (page: Page): Promise<Response> => page.waitForResponse(isCanvasSave);

export const waitForLibraryOrderSave = (page: Page): Promise<Response> => page.waitForResponse(isLibraryOrderSave);
