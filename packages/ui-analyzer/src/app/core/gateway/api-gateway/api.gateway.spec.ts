import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsRequestDto, PickedFileDto, SessionPublicationDto, WindowRequestDto } from '../analyzer.dto';
import { insightsReportDtoFixture } from '../analyzer.gateway.fixture';
import { GatewayRequestError, statusOfFailure } from '../gateway-request-error/gateway-request-error';
import { ApiGateway, type ApiTransport } from './api.gateway';

type Exchange = {
  readonly name: string;
  readonly call: (gateway: ApiGateway) => Promise<unknown>;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
};

type Download = {
  readonly fileName: string;
  readonly href: string;
  readonly isInTheDocument: boolean;
};

const DOWNLOAD_REVOKE_DELAY = 4000;
const DOWNLOAD_HREF = 'blob:download';
const PICKED: readonly PickedFileDto[] = [{ name: 'cpu.rrd', path: 'memory:/1/cpu.rrd', size: 2048 }];
const CANVAS = [{ seriesId: 's1', label: 'cpu', merged: [] }];
const LIBRARY_ORDER = [{ seriesId: 's1', label: 'cpu' }];
const SERIES_COLOR = { seriesId: 's1', label: 'cpu', color: '#1d80ac' };
const WINDOW_REQUEST: WindowRequestDto = { analysisId: 'a1', seriesIds: ['s1'], fromMilliseconds: 0, untilMilliseconds: 60_000, columns: 300 };
const INSIGHTS_REQUEST: InsightsRequestDto = { analysisId: 'a1', scope: 'all', fromMilliseconds: 0, untilMilliseconds: 60_000, seriesIds: ['s1'] };
const PUBLICATION: SessionPublicationDto = { log: { name: 'service.ndjson', content: '{}', view: { isShown: true } } };

const ANSWERING_EXCHANGES: readonly Exchange[] = [
  { name: 'fetchBuild', call: async (gateway) => await gateway.fetchBuild(), method: 'GET', path: '/api/build' },
  { name: 'fetchSampleAnalysis', call: async (gateway) => await gateway.fetchSampleAnalysis(), method: 'GET', path: '/api/sample-analysis' },
  { name: 'listAnalyses', call: async (gateway) => await gateway.listAnalyses(), method: 'GET', path: '/api/analyses' },
  {
    name: 'createAnalysis',
    call: async (gateway) => await gateway.createAnalysis('capacity', PICKED),
    method: 'POST',
    path: '/api/analyses',
    body: { name: 'capacity', files: PICKED },
  },
  {
    name: 'renameAnalysis',
    call: async (gateway) => await gateway.renameAnalysis('a1', 'renamed'),
    method: 'PATCH',
    path: '/api/analyses/a1',
    body: { name: 'renamed' },
  },
  {
    name: 'addSources',
    call: async (gateway) => await gateway.addSources('a1', PICKED),
    method: 'POST',
    path: '/api/analyses/a1/sources',
    body: { files: PICKED },
  },
  { name: 'openAnalysis', call: async (gateway) => await gateway.openAnalysis('a1'), method: 'GET', path: '/api/analyses/a1/bundle' },
  { name: 'missingSources', call: async (gateway) => await gateway.missingSources('a1'), method: 'GET', path: '/api/analyses/a1/missing-sources' },
  { name: 'fetchSeries', call: async (gateway) => await gateway.fetchSeries(WINDOW_REQUEST), method: 'POST', path: '/api/series', body: WINDOW_REQUEST },
  { name: 'fetchChart', call: async (gateway) => await gateway.fetchChart(WINDOW_REQUEST), method: 'POST', path: '/api/chart', body: WINDOW_REQUEST },
  {
    name: 'fetchInsightsConfiguration',
    call: async (gateway) => await gateway.fetchInsightsConfiguration(),
    method: 'GET',
    path: '/api/insights/configuration',
  },
  {
    name: 'fetchSearchHistory',
    call: async (gateway) => await gateway.fetchSearchHistory('chart filter'),
    method: 'GET',
    path: '/api/search-history/chart%20filter',
  },
  {
    name: 'rememberSearch',
    call: async (gateway) => await gateway.rememberSearch('charts', 'cpu'),
    method: 'POST',
    path: '/api/search-history/charts',
    body: { term: 'cpu' },
  },
  {
    name: 'forgetSearch',
    call: async (gateway) => await gateway.forgetSearch('charts', 'cpu'),
    method: 'POST',
    path: '/api/search-history/charts/forget',
    body: { term: 'cpu' },
  },
  { name: 'listSessions', call: async (gateway) => await gateway.listSessions(), method: 'GET', path: '/api/sessions' },
  {
    name: 'startSession',
    call: async (gateway) => await gateway.startSession('a1', PUBLICATION),
    method: 'POST',
    path: '/api/analyses/a1/session',
    body: PUBLICATION,
  },
  {
    name: 'publishSession',
    call: async (gateway) => await gateway.publishSession('a1', PUBLICATION),
    method: 'PUT',
    path: '/api/analyses/a1/session',
    body: PUBLICATION,
  },
  {
    name: 'joinSession',
    call: async (gateway) => await gateway.joinSession('session/1', 'key-1'),
    method: 'POST',
    path: '/api/shared-sessions',
    body: { sessionId: 'session/1', key: 'key-1' },
  },
  {
    name: 'refreshSession',
    call: async (gateway) => await gateway.refreshSession('session/1'),
    method: 'POST',
    path: '/api/shared-sessions/session%2F1/refresh',
  },
];

const WRITING_EXCHANGES: readonly Exchange[] = [
  { name: 'deleteAnalysis', call: async (gateway) => await gateway.deleteAnalysis('a1'), method: 'DELETE', path: '/api/analyses/a1' },
  {
    name: 'saveCanvas',
    call: async (gateway) => await gateway.saveCanvas('a1', CANVAS),
    method: 'PUT',
    path: '/api/analyses/a1/canvas',
    body: { canvas: CANVAS },
  },
  {
    name: 'saveLibraryOrder',
    call: async (gateway) => await gateway.saveLibraryOrder('a1', LIBRARY_ORDER),
    method: 'PUT',
    path: '/api/analyses/a1/library-order',
    body: { libraryOrder: LIBRARY_ORDER },
  },
  {
    name: 'saveSeriesColor',
    call: async (gateway) => await gateway.saveSeriesColor('a1', SERIES_COLOR),
    method: 'PUT',
    path: '/api/analyses/a1/series-color',
    body: SERIES_COLOR,
  },
  { name: 'endSession', call: async (gateway) => await gateway.endSession('a1'), method: 'DELETE', path: '/api/analyses/a1/session' },
  { name: 'forgetSession', call: async (gateway) => await gateway.forgetSession('s-1'), method: 'DELETE', path: '/api/shared-sessions/s-1' },
];

class TransportedGateway extends ApiGateway {
  public constructor(send: ApiTransport['send'], describeFiles: ApiTransport['describeFiles']) {
    super({ send, describeFiles });
  }
}

const answeringWith = (answer: unknown, status = 200): ApiTransport['send'] =>
  vi.fn<ApiTransport['send']>().mockImplementation(async () => new Response(JSON.stringify(answer), { status }));

const describingAsPicked = (): ApiTransport['describeFiles'] => vi.fn<ApiTransport['describeFiles']>().mockResolvedValue(PICKED);

const gatewayOver = (send: ApiTransport['send']): ApiGateway => new TransportedGateway(send, describingAsPicked());

const recordDownloads = (): readonly Download[] => {
  const downloads: Download[] = [];

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function recordDownload(this: HTMLAnchorElement) {
    downloads.push({ fileName: this.download, href: this.getAttribute('href') ?? '', isInTheDocument: this.isConnected });
  });

  return downloads;
};

describe('ApiGateway', () => {
  it.each(ANSWERING_EXCHANGES)(
    'ApiGateway $name sends $method $path with its body and answers with the json the route answered',
    async ({ call, method, path, body }) => {
      const send = answeringWith({ answeredBy: path });

      const answered = await call(gatewayOver(send));

      expect(send).toHaveBeenCalledWith({ method, path, body, cancellation: undefined });
      expect(answered).toEqual({ answeredBy: path });
    },
  );

  it.each(WRITING_EXCHANGES)(
    'ApiGateway $name sends $method $path with its body and answers with nothing once the route took it',
    async ({ call, method, path, body }) => {
      const send = answeringWith(null);

      const answered = await call(gatewayOver(send));

      expect(send).toHaveBeenCalledWith({ method, path, body, cancellation: undefined });
      expect(answered).toBeUndefined();
    },
  );

  it('ApiGateway runInsights posts the request to the insights of its analysis, cancellable by the page, and answers with the report', async () => {
    const report = insightsReportDtoFixture();
    const send = answeringWith(report);
    const cancellation = new AbortController();

    const answered = await gatewayOver(send).runInsights(INSIGHTS_REQUEST, cancellation.signal);

    expect(send).toHaveBeenCalledWith({ method: 'POST', path: '/api/analyses/a1/insights', body: INSIGHTS_REQUEST, cancellation: cancellation.signal });
    expect(answered).toEqual(report);
  });

  it('ApiGateway, when a route refuses, fails naming the route, the status and what the route said', async () => {
    const send = vi.fn<ApiTransport['send']>().mockResolvedValue(new Response('analysis not found', { status: 404 }));

    await expect(gatewayOver(send).deleteAnalysis('missing')).rejects.toThrow('DELETE /api/analyses/missing failed: 404 analysis not found');
  });

  it('ApiGateway, when a route refuses, fails with the status the route answered, so a caller can tell a session that ended from one it could not reach', async () => {
    const send = vi.fn<ApiTransport['send']>().mockResolvedValue(new Response('sharing: the session has ended', { status: 404 }));

    const failure = await gatewayOver(send)
      .refreshSession('s-1')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GatewayRequestError);
    expect(statusOfFailure(failure)).toBe(404);
  });

  it('ApiGateway describeSources has no paths to describe in a page, so it describes nothing', async () => {
    const send = answeringWith(null);

    expect(await gatewayOver(send).describeSources()).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('ApiGateway describeFiles leaves describing the dropped files to its transport', async () => {
    const describeFiles = describingAsPicked();
    const files = [new File(['RRD'], 'cpu.rrd')];

    const described = await new TransportedGateway(answeringWith(null), describeFiles).describeFiles(files);

    expect(described).toEqual(PICKED);
    expect(describeFiles).toHaveBeenCalledWith(files);
  });

  it('ApiGateway watchFileDrop has no window to watch in a page, so stopping the watch has nothing to stop', () => {
    const stopWatching = gatewayOver(answeringWith(null)).watchFileDrop();

    expect(stopWatching()).toBeUndefined();
  });
});

describe('ApiGateway downloads', () => {
  const objectUrls = { created: [] as Blob[], revoked: [] as string[] };

  beforeEach(() => {
    vi.useFakeTimers();
    objectUrls.created = [];
    objectUrls.revoked = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob): string => {
        objectUrls.created.push(blob);

        return DOWNLOAD_HREF;
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: (href: string): void => {
        objectUrls.revoked.push(href);
      },
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('ApiGateway exportCsv downloads the csv the route wrote under its file name and answers with what it counted', async () => {
    const downloads = recordDownloads();
    const send = answeringWith({ fileName: 'cpu.csv', content: 'time,cpu\n1,2', sampleCount: 1, seriesCount: 1 });

    const exported = await gatewayOver(send).exportCsv({ analysisId: 'a1', seriesIds: ['s1'], fromMilliseconds: 0, untilMilliseconds: 60_000 });

    expect(exported).toEqual({ sampleCount: 1, seriesCount: 1 });
    expect(downloads).toEqual([{ fileName: 'cpu.csv', href: DOWNLOAD_HREF, isInTheDocument: true }]);
    expect(objectUrls.created[0]?.type).toBe('text/csv');
    expect(await objectUrls.created[0]?.text()).toBe('time,cpu\n1,2');
  });

  it('ApiGateway exportImage downloads the image under its file name and answers with that name', async () => {
    const downloads = recordDownloads();
    const image = new Blob(['png'], { type: 'image/png' });

    const exported = await gatewayOver(answeringWith(null)).exportImage('chart.png', image);

    expect(exported).toBe('chart.png');
    expect(downloads).toEqual([{ fileName: 'chart.png', href: DOWNLOAD_HREF, isInTheDocument: true }]);
    expect(objectUrls.created).toEqual([image]);
  });

  it('ApiGateway exportSources downloads the archive the route encoded and answers with its name and how many files it holds', async () => {
    const downloads = recordDownloads();
    const send = answeringWith({ fileName: 'capacity.zip', content: 'UEsDBA==', fileCount: 2 });

    const exported = await gatewayOver(send).exportSources('a1');

    expect(exported).toEqual({ path: 'capacity.zip', fileCount: 2 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/api/analyses/a1/sources' }));
    expect(downloads).toEqual([{ fileName: 'capacity.zip', href: DOWNLOAD_HREF, isInTheDocument: true }]);
    expect(objectUrls.created[0]?.type).toBe('application/octet-stream');
    expect(new Uint8Array((await objectUrls.created[0]?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  });

  it('ApiGateway, a while after a download started, takes its link away and lets go of the downloaded content', async () => {
    recordDownloads();

    await gatewayOver(answeringWith(null)).exportImage('chart.png', new Blob(['png']));
    vi.advanceTimersByTime(DOWNLOAD_REVOKE_DELAY - 1);

    expect(document.querySelector('a[download]')).not.toBeNull();
    expect(objectUrls.revoked).toEqual([]);

    vi.advanceTimersByTime(1);

    expect(document.querySelector('a[download]')).toBeNull();
    expect(objectUrls.revoked).toEqual([DOWNLOAD_HREF]);
  });
});
