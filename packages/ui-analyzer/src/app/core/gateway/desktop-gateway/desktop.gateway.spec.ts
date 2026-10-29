import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InsightsReportDto, InsightsRequestDto, PickedFileDto, SessionPublicationDto, WindowRequestDto } from '../analyzer.dto';
import { insightsReportDtoFixture } from '../analyzer.gateway.fixture';
import { DesktopGateway } from './desktop.gateway';

type BoundMethods = Readonly<Record<string, (...parameters: never[]) => unknown>>;

type DropHandler = (horizontalPosition: number, verticalPosition: number, paths: readonly string[]) => void;

type Delegation = {
  readonly method: string;
  readonly call: (gateway: DesktopGateway) => Promise<unknown>;
  readonly parameters: readonly unknown[];
};

const PICKED: readonly PickedFileDto[] = [{ name: 'cpu.rrd', path: '/rrd/cpu.rrd', size: 2048 }];
const CANVAS = [{ seriesId: 's1', label: 'cpu', merged: [] }];
const LIBRARY_ORDER = [{ seriesId: 's1', label: 'cpu' }];
const SERIES_COLOR = { seriesId: 's1', label: 'cpu', color: '#1d80ac' };
const WINDOW_REQUEST: WindowRequestDto = { analysisId: 'a1', seriesIds: ['s1'], fromMilliseconds: 0, untilMilliseconds: 60_000, columns: 300 };
const EXPORT_REQUEST = { analysisId: 'a1', seriesIds: ['s1'], fromMilliseconds: 0, untilMilliseconds: 60_000 };
const INSIGHTS_REQUEST: InsightsRequestDto = { analysisId: 'a1', scope: 'all', fromMilliseconds: 0, untilMilliseconds: 60_000, seriesIds: ['s1'] };
const PUBLICATION: SessionPublicationDto = { log: null };

const ANSWERING_DELEGATIONS: readonly Delegation[] = [
  { method: 'Build', call: async (gateway) => await gateway.fetchBuild(), parameters: [] },
  { method: 'ListAnalyses', call: async (gateway) => await gateway.listAnalyses(), parameters: [] },
  { method: 'CreateAnalysis', call: async (gateway) => await gateway.createAnalysis('capacity', PICKED), parameters: ['capacity', PICKED] },
  { method: 'RenameAnalysis', call: async (gateway) => await gateway.renameAnalysis('a1', 'renamed'), parameters: ['a1', 'renamed'] },
  { method: 'AddSources', call: async (gateway) => await gateway.addSources('a1', PICKED), parameters: ['a1', PICKED] },
  { method: 'OpenAnalysis', call: async (gateway) => await gateway.openAnalysis('a1'), parameters: ['a1'] },
  { method: 'MissingSources', call: async (gateway) => await gateway.missingSources('a1'), parameters: ['a1'] },
  { method: 'FetchSeries', call: async (gateway) => await gateway.fetchSeries(WINDOW_REQUEST), parameters: [WINDOW_REQUEST] },
  { method: 'FetchChart', call: async (gateway) => await gateway.fetchChart(WINDOW_REQUEST), parameters: [WINDOW_REQUEST] },
  { method: 'SelectRRDFiles', call: async (gateway) => await gateway.pickSources(), parameters: [] },
  { method: 'DescribeSources', call: async (gateway) => await gateway.describeSources(['/rrd/cpu.rrd']), parameters: [['/rrd/cpu.rrd']] },
  { method: 'ExportCSV', call: async (gateway) => await gateway.exportCsv(EXPORT_REQUEST), parameters: [EXPORT_REQUEST] },
  { method: 'ExportSources', call: async (gateway) => await gateway.exportSources('a1'), parameters: ['a1'] },
  { method: 'InsightsConfiguration', call: async (gateway) => await gateway.fetchInsightsConfiguration(), parameters: [] },
  { method: 'SearchHistory', call: async (gateway) => await gateway.fetchSearchHistory('charts'), parameters: ['charts'] },
  { method: 'RememberSearch', call: async (gateway) => await gateway.rememberSearch('charts', 'cpu'), parameters: ['charts', 'cpu'] },
  { method: 'ForgetSearch', call: async (gateway) => await gateway.forgetSearch('charts', 'cpu'), parameters: ['charts', 'cpu'] },
  { method: 'ListSessions', call: async (gateway) => await gateway.listSessions(), parameters: [] },
  { method: 'StartSession', call: async (gateway) => await gateway.startSession('a1', PUBLICATION), parameters: ['a1', PUBLICATION] },
  { method: 'PublishSession', call: async (gateway) => await gateway.publishSession('a1', PUBLICATION), parameters: ['a1', PUBLICATION] },
];

const WRITING_DELEGATIONS: readonly Delegation[] = [
  { method: 'DeleteAnalysis', call: async (gateway) => await gateway.deleteAnalysis('a1'), parameters: ['a1'] },
  { method: 'SaveCanvas', call: async (gateway) => await gateway.saveCanvas('a1', CANVAS), parameters: ['a1', CANVAS] },
  { method: 'SaveLibraryOrder', call: async (gateway) => await gateway.saveLibraryOrder('a1', LIBRARY_ORDER), parameters: ['a1', LIBRARY_ORDER] },
  { method: 'SaveSeriesColor', call: async (gateway) => await gateway.saveSeriesColor('a1', SERIES_COLOR), parameters: ['a1', SERIES_COLOR] },
  { method: 'EndSession', call: async (gateway) => await gateway.endSession('a1'), parameters: ['a1'] },
];

const bindDesktop = (methods: BoundMethods): void => {
  vi.stubGlobal('go', { desktop: { API: methods } });
};

describe('DesktopGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(ANSWERING_DELEGATIONS)(
    'DesktopGateway calling $method hands the binding its arguments and answers with what the binding answered',
    async ({ method, call, parameters }) => {
      const answer = { answeredBy: method };
      const bound = vi.fn().mockResolvedValue(answer);
      bindDesktop({ [method]: bound });

      const answered = await call(new DesktopGateway());

      expect(bound).toHaveBeenCalledWith(...parameters);
      expect(answered).toEqual(answer);
    },
  );

  it.each(WRITING_DELEGATIONS)(
    'DesktopGateway calling $method hands the binding its arguments and answers with nothing once it is written',
    async ({ method, call, parameters }) => {
      const bound = vi.fn().mockResolvedValue(null);
      bindDesktop({ [method]: bound });

      const answered = await call(new DesktopGateway());

      expect(bound).toHaveBeenCalledWith(...parameters);
      expect(answered).toBeUndefined();
    },
  );

  it.each([
    { name: 'joinSession', call: async (gateway: DesktopGateway) => await gateway.joinSession() },
    { name: 'refreshSession', call: async (gateway: DesktopGateway) => await gateway.refreshSession() },
    { name: 'forgetSession', call: async (gateway: DesktopGateway) => await gateway.forgetSession() },
  ])('DesktopGateway $name refuses, since a live session is only ever followed from its link in the browser edition', async ({ call }) => {
    await expect(call(new DesktopGateway())).rejects.toThrow('a live session is opened from its link in the browser edition, never in the desktop window');
  });

  it('DesktopGateway fetchSampleAnalysis offers no sample, since the desktop app opens the analyses kept on disk', async () => {
    bindDesktop({});

    expect(await new DesktopGateway().fetchSampleAnalysis()).toBeNull();
  });

  it('DesktopGateway describeFiles describes files dropped on the page by name and size, with no path to read them from', async () => {
    const described = await new DesktopGateway().describeFiles([new File(['RRD'], 'cpu.rrd')]);

    expect(described).toEqual([{ name: 'cpu.rrd', path: '', size: 3 }]);
  });

  it('DesktopGateway exportImage hands the binding the file name and the image encoded in base64, and answers with the path it was written to', async () => {
    const exportImage = vi.fn().mockResolvedValue('/exports/chart.png');
    bindDesktop({ ExportImage: exportImage });

    const path = await new DesktopGateway().exportImage('chart.png', new Blob(['png'], { type: 'image/png' }));

    expect(path).toBe('/exports/chart.png');
    expect(exportImage).toHaveBeenCalledWith('chart.png', 'cG5n');
  });

  it('DesktopGateway runInsights, when the page gives up while the run is going, asks the desktop to cancel that same run', async () => {
    const cancellation = new AbortController();
    const report = insightsReportDtoFixture();

    const runInsights = vi.fn<(runId: string, request: InsightsRequestDto) => Promise<InsightsReportDto>>().mockImplementation(async () => {
      cancellation.abort();

      return report;
    });

    const cancelInsights = vi.fn().mockResolvedValue(null);
    bindDesktop({ RunInsights: runInsights, CancelInsights: cancelInsights });

    const answered = await new DesktopGateway().runInsights(INSIGHTS_REQUEST, cancellation.signal);

    expect(answered).toEqual(report);
    expect(runInsights).toHaveBeenCalledWith(expect.any(String), INSIGHTS_REQUEST);
    expect(cancelInsights).toHaveBeenCalledWith(runInsights.mock.calls[0]?.[0]);
  });

  it('DesktopGateway runInsights, once the run is over, no longer cancels it when the page gives up', async () => {
    const cancellation = new AbortController();
    const cancelInsights = vi.fn().mockResolvedValue(null);
    bindDesktop({ RunInsights: vi.fn().mockResolvedValue(insightsReportDtoFixture()), CancelInsights: cancelInsights });

    await new DesktopGateway().runInsights(INSIGHTS_REQUEST, cancellation.signal);
    cancellation.abort();

    expect(cancelInsights).not.toHaveBeenCalled();
  });

  it('DesktopGateway, when the desktop did not bind a method, fails naming the binding it looked for', async () => {
    vi.stubGlobal('go', undefined);

    await expect(new DesktopGateway().fetchBuild()).rejects.toThrow('desktop binding desktop.API.Build is not available');
  });

  it('DesktopGateway watchFileDrop, outside the desktop window, watches nothing and stops watching nothing', () => {
    vi.stubGlobal('runtime', undefined);
    const handler = vi.fn();

    const stopWatching = new DesktopGateway().watchFileDrop(handler);
    stopWatching();

    expect(handler).not.toHaveBeenCalled();
  });

  it('DesktopGateway watchFileDrop hands over the paths of the files dropped on the window, until it is told to stop', () => {
    const runtime = { OnFileDrop: vi.fn<(dropped: DropHandler, useDropTarget: boolean) => void>(), OnFileDropOff: vi.fn() };
    vi.stubGlobal('runtime', runtime);
    const handler = vi.fn();

    const stopWatching = new DesktopGateway().watchFileDrop(handler);
    runtime.OnFileDrop.mock.calls[0]?.[0](120, 80, ['/rrd/cpu.rrd', '/rrd/memory.rrd']);
    stopWatching();

    expect(handler).toHaveBeenCalledWith(['/rrd/cpu.rrd', '/rrd/memory.rrd']);
    expect(runtime.OnFileDrop).toHaveBeenCalledWith(expect.any(Function), true);
    expect(runtime.OnFileDropOff).toHaveBeenCalledTimes(1);
  });
});
