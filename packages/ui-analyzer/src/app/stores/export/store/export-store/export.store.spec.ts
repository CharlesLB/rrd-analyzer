import { TestBed } from '@angular/core/testing';
import { MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import { ThemeStore } from '@rrd-analyzer/ui-shared';
import { stubBrowserStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlottedChartDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import {
  analyzerGatewayStub,
  bundleDtoFixture,
  chartsDtoFixture,
  FIXTURE_UNTIL_MILLISECONDS,
  provideGatewayStub,
} from '../../../../core/gateway/analyzer.gateway.fixture';
import { SERIES_COLORS, THEME_COLORS } from '../../../../shared/constants/colors';
import { removeClipboard, stubClipboard } from '../../../../shared/utils/clipboard-image/clipboard-image.fixture';
import { stubCanvasEncoding, stubImageLoading } from '../../../../shared/utils/svg-raster/svg-raster.fixture';
import { InsightsStore } from '../../../insights/store/insights-store/insights.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SeriesDataStore } from '../../../workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import { ExportStore } from './export.store';

const PNG = new Blob(['png'], { type: 'image/png' });
const FONT = new Blob([new Uint8Array([0x77, 0x4f, 0x46, 0x32])], { type: 'font/woff2' });
const PLACEMENT = { chartId: 's3', top: 100, bottom: null, right: 46 };
const INSIGHTS_RUN_MILLISECONDS = 1800;
const SINGLE_CHART_PNG = /^rrd_atlas-metric-3_\d{12}_\d{12}\.png$/;

const textOfBlob = async (blob: Blob): Promise<string> =>
  await new Promise<string>((resolve) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(`${reader.result}`));
    reader.readAsText(blob);
  });

describe('ExportStore', () => {
  let gateway: AnalyzerGateway;
  let store: ExportStore;
  let toasts: ToastStore;

  const configure = async (
    overrides: Partial<AnalyzerGateway> = {},
    answerFont = async () => ({ ok: true, status: 200, blob: async () => FONT }),
    canvas: readonly PlottedChartDto[] = chartsDtoFixture('s3', 's5'),
  ) => {
    stubBrowserStorage();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(answerFont));
    gateway = analyzerGatewayStub({ openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture(7, { canvas })), ...overrides });
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway), WorkspaceStore, SeriesDataStore, TimeWindowStore, InsightsStore, ExportStore] });
    await TestBed.inject(WorkspaceStore).open('a1');
    store = TestBed.inject(ExportStore);
    toasts = TestBed.inject(ToastStore);
  };

  const runInsights = async (): Promise<void> => {
    vi.useFakeTimers();
    const running = TestBed.inject(InsightsStore).run();
    await vi.advanceTimersByTimeAsync(INSIGHTS_RUN_MILLISECONDS);
    await running;
    vi.useRealTimers();
  };

  const exportFromMenu = async (format: Parameters<ExportStore['exportChart']>[0]): Promise<boolean> => {
    store.toggleMenu(PLACEMENT);

    return await store.exportChart(format);
  };

  const savedFile = (): { readonly name: string; readonly file: Blob } => {
    const [name, file] = vi.mocked(gateway.exportImage).mock.calls[0] ?? ['', new Blob()];

    return { name, file };
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    removeClipboard();
  });

  describe('menu', () => {
    it('toggleMenu from a chart opens the menu under its button, in its color and scoped to it over the window, and a second toggle closes it', async () => {
      await configure();

      store.toggleMenu(PLACEMENT);

      expect(store.menuDetails()).toEqual({ ...PLACEMENT, color: SERIES_COLORS[0], scopeLabel: 'atlas_metric_3 · 24 h', chartCount: 2, seriesCount: 1 });

      store.toggleMenu(PLACEMENT);

      expect(store.menu()).toBeNull();
    });

    it('menuChartId and menuDetails name nothing until a menu is opened, and menuChartId then names its chart', async () => {
      await configure();
      const chartIdBeforeOpening = store.menuChartId();
      const detailsBeforeOpening = store.menuDetails();

      store.toggleMenu(PLACEMENT);

      expect(chartIdBeforeOpening).toBeNull();
      expect(detailsBeforeOpening).toBeNull();
      expect(store.menuChartId()).toBe('s3');
    });

    it('menuDetails for a chart the canvas does not hold has nothing to describe', async () => {
      await configure();

      store.toggleMenu({ ...PLACEMENT, chartId: 's9' });

      expect(store.menuChartId()).toBe('s9');
      expect(store.menuDetails()).toBeNull();
    });

    it('menuDetails once insights have found something says the findings will be shaded in the export', async () => {
      await configure();
      await runInsights();

      store.toggleMenu(PLACEMENT);

      expect(store.menuDetails()?.scopeLabel).toBe('atlas_metric_3 · 24 h · findings shaded');
    });

    it('exportChart with no menu open exports nothing and reports that nothing was written', async () => {
      await configure();

      expect(await store.exportChart('png')).toBe(false);

      expect(gateway.exportImage).not.toHaveBeenCalled();
      expect(gateway.exportCsv).not.toHaveBeenCalled();
    });
  });

  describe('png', () => {
    it('exportChart PNG renders the chart from 960 buckets of the window, closes the menu and saves a png named after the chart', async () => {
      await configure();
      stubImageLoading('load');
      stubCanvasEncoding(PNG);

      expect(await exportFromMenu('png')).toBe(true);

      expect(store.menu()).toBeNull();
      expect(gateway.fetchSeries).toHaveBeenCalledWith({
        analysisId: 'a1',
        seriesIds: ['s3'],
        fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 24 * MILLISECONDS_PER_HOUR,
        untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS,
        columns: 960,
      });
      expect(savedFile().name).toMatch(SINGLE_CHART_PNG);
      expect(savedFile().file).toBe(PNG);
      expect(toasts.message()).toBe('PNG exported · 1920×1080');
    });

    it('exportChart PNG the engine cannot draw says the render failed and saves nothing', async () => {
      await configure();
      stubImageLoading('error');
      stubCanvasEncoding(PNG);

      expect(await exportFromMenu('png')).toBe(false);

      expect(gateway.exportImage).not.toHaveBeenCalled();
      expect(toasts.message()).toBe('PNG render failed — export SVG instead');
    });

    it('exportChart PNG whose save dialog is cancelled announces nothing past the rendering, and reports no export', async () => {
      await configure({ exportImage: vi.fn().mockResolvedValue('') });
      stubImageLoading('load');
      stubCanvasEncoding(PNG);

      expect(await exportFromMenu('png')).toBe(false);

      expect(toasts.message()).toBe('rendering PNG…');
    });

    it('exportChart PNG the transport cannot write says the export could not be saved', async () => {
      await configure({ exportImage: vi.fn().mockRejectedValue(new Error('disk full')) });
      stubImageLoading('load');
      stubCanvasEncoding(PNG);

      expect(await exportFromMenu('png')).toBe(false);

      expect(toasts.message()).toBe('the export could not be saved');
    });

    it('exportAllCharts renders every chart on the canvas into one png named after the window alone', async () => {
      await configure();
      stubImageLoading('load');
      stubCanvasEncoding(PNG);
      store.toggleMenu(PLACEMENT);

      await store.exportAllCharts();

      expect(store.menu()).toBeNull();
      expect(gateway.fetchSeries).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s3', 's5'], columns: 960 }));
      expect(savedFile().name).toMatch(/^rrd_\d{12}_\d{12}\.png$/);
      expect(toasts.message()).toBe('PNG exported · 1920×1080');
    });
  });

  describe('an empty canvas', () => {
    it('exportAllCharts on a canvas with no chart says there is nothing to export and renders nothing', async () => {
      await configure({}, undefined, []);

      const isExported = await store.exportAllCharts();

      expect(isExported).toBe(false);
      expect(gateway.exportImage).not.toHaveBeenCalled();
      expect(toasts.message()).toBe('nothing on the canvas to export');
    });
  });

  describe('svg', () => {
    it('exportChart SVG saves the markup itself, in the current theme and with the bundled font embedded', async () => {
      await configure();
      TestBed.inject(ThemeStore).toggle();

      await exportFromMenu('svg');
      const markup = await textOfBlob(savedFile().file);

      expect(savedFile().name).toMatch(/^rrd_atlas-metric-3_\d{12}_\d{12}\.svg$/);
      expect(savedFile().file.type).toBe('image/svg+xml;charset=utf-8');
      expect(markup).toContain(`<rect width="1920" height="1080" fill="${THEME_COLORS.dark.bg}"/>`);
      expect(markup).toContain("@font-face{font-family:'Nunito';font-weight:200 1000;src:url(data:font/woff2;base64,d09GMg==) format('woff2')}");
      expect(toasts.message()).toBe('SVG exported · 1920×1080 vector');
    });

    it('exportChart SVG after insights counts the findings it shaded in its notice', async () => {
      await configure();
      await runInsights();

      await exportFromMenu('svg');

      expect(toasts.message()).toBe('SVG exported · 1920×1080 vector · 2 findings shaded');
    });

    it('exportChart SVG with the findings hidden from the charts shades none of them', async () => {
      await configure();
      await runInsights();
      TestBed.inject(InsightsStore).toggleOverlays();

      store.toggleMenu(PLACEMENT);

      expect(store.menuDetails()?.scopeLabel).toBe('atlas_metric_3 · 24 h');

      await store.exportChart('svg');

      expect(toasts.message()).toBe('SVG exported · 1920×1080 vector');
    });

    it('exportChart SVG whose series cannot be read says the series are unavailable and saves nothing', async () => {
      await configure({ fetchSeries: vi.fn().mockRejectedValue(new Error('daemon away')) });

      const isExported = await exportFromMenu('svg');

      expect(isExported).toBe(false);
      expect(gateway.exportImage).not.toHaveBeenCalled();
      expect(toasts.message()).toBe('Could not read the series for this window');
    });

    it('exportChart SVG without the bundled font still exports, on the font stack alone', async () => {
      await configure({}, async () => await Promise.reject(new Error('offline')));

      await exportFromMenu('svg');

      expect(await textOfBlob(savedFile().file)).not.toContain('@font-face');
      expect(toasts.message()).toBe('SVG exported · 1920×1080 vector');
    });
  });

  describe('csv', () => {
    it('exportChart CSV exports only the chart the menu was opened from, over the window', async () => {
      await configure();

      await exportFromMenu('csv');

      expect(gateway.exportCsv).toHaveBeenCalledWith({
        analysisId: 'a1',
        seriesIds: ['s3'],
        fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 24 * MILLISECONDS_PER_HOUR,
        untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS,
      });
      expect(toasts.message()).toBe('CSV exported · 288 samples × 1 chart');
    });
  });

  describe('csv with nothing in it', () => {
    it('exportChart CSV over a window with no samples says so instead of saying nothing', async () => {
      await configure({ exportCsv: vi.fn().mockResolvedValue({ path: '/exports/empty.csv', sampleCount: 0, seriesCount: 1 }) });

      await expect(exportFromMenu('csv')).resolves.toBe(false);

      expect(toasts.message()).toBe('no samples in this window to export');
    });

    it('exportChart CSV the transport cannot write says the export could not be saved', async () => {
      await configure({ exportCsv: vi.fn().mockRejectedValue(new Error('disk full')) });

      const isExported = await exportFromMenu('csv');

      expect(isExported).toBe(false);
      expect(toasts.message()).toBe('the export could not be saved');
    });

    it('exportChart CSV whose save dialog was cancelled says nothing', async () => {
      await configure({ exportCsv: vi.fn().mockResolvedValue({ path: '', sampleCount: 0, seriesCount: 0 }) });

      await expect(exportFromMenu('csv')).resolves.toBe(false);

      expect(toasts.message()).toBeNull();
    });
  });

  describe('rrd sources', () => {
    it('exportSources copies the sources of the open analysis and says how many files the zip holds', async () => {
      await configure();

      const isExported = await store.exportSources();

      expect(isExported).toBe(true);
      expect(gateway.exportSources).toHaveBeenCalledWith('a1');
      expect(toasts.message()).toBe('RRD files exported · 2 files in one zip');
    });

    it('exportSources of a single source names it as one file', async () => {
      await configure({ exportSources: vi.fn().mockResolvedValue({ path: '/exports/cpu.rrd', fileCount: 1 }) });

      await store.exportSources();

      expect(toasts.message()).toBe('RRD file exported');
    });

    it('exportSources whose save dialog is cancelled reports nothing saved and shows no toast', async () => {
      await configure({ exportSources: vi.fn().mockResolvedValue({ path: '', fileCount: 0 }) });

      expect(await store.exportSources()).toBe(false);
      expect(toasts.message()).toBeNull();
    });

    it('exportSources over a source that moved says the files could not be exported', async () => {
      await configure({ exportSources: vi.fn().mockRejectedValue(new Error('moved')) });

      expect(await store.exportSources()).toBe(false);
      expect(toasts.message()).toBe('the RRD files could not be exported, check they are still where this analysis opened them from');
    });
  });

  describe('clipboard', () => {
    it('exportChart COPY hands the clipboard the png while it is still rendering and says it was copied', async () => {
      await configure();
      stubImageLoading('load');
      stubCanvasEncoding(PNG);
      const write = vi.fn().mockResolvedValue(undefined);
      stubClipboard(write);

      await exportFromMenu('copy');

      expect(write).toHaveBeenCalledTimes(1);
      expect(await write.mock.calls[0]?.[0][0].items['image/png']).toBe(PNG);
      expect(gateway.exportImage).not.toHaveBeenCalled();
      expect(toasts.message()).toBe('PNG copied — paste into the postmortem');
    });

    it('exportChart COPY refused by the clipboard says the copy was blocked', async () => {
      await configure();
      stubImageLoading('load');
      stubCanvasEncoding(PNG);
      stubClipboard(vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')));

      await exportFromMenu('copy');

      expect(toasts.message()).toBe('copy blocked — use “PNG image” to download');
    });

    it('exportChart COPY without an image clipboard saves the png instead', async () => {
      await configure();
      stubImageLoading('load');
      stubCanvasEncoding(PNG);

      await exportFromMenu('copy');

      expect(savedFile().name).toMatch(SINGLE_CHART_PNG);
      expect(toasts.message()).toBe('PNG exported · 1920×1080');
    });
  });

  describe('merged charts', () => {
    const MERGED_CANVAS: readonly PlottedChartDto[] = [
      {
        series: [
          { seriesId: 's3', axis: 0 },
          { seriesId: 's1', axis: 1 },
        ],
      },
      ...chartsDtoFixture('s5'),
    ];

    it('menuDetails of a merged chart scopes the menu to every series it draws', async () => {
      await configure({}, undefined, MERGED_CANVAS);

      store.toggleMenu(PLACEMENT);

      expect(store.menuDetails()).toMatchObject({ scopeLabel: 'atlas_metric_3 + atlas_metric_1 · 24 h', chartCount: 2, seriesCount: 2 });
    });

    it('exportChart as csv from a merged chart exports every series it draws', async () => {
      await configure({}, undefined, MERGED_CANVAS);

      await exportFromMenu('csv');

      expect(gateway.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s3', 's1'] }));
    });

    it('exportChart as svg from a merged chart draws it as one chart with a line per series, named after all of them', async () => {
      await configure({}, undefined, MERGED_CANVAS);

      await exportFromMenu('svg');
      const { name, file } = savedFile();
      const markup = await textOfBlob(file);

      expect(name).toMatch(/^rrd_atlas-metric-3-atlas-metric-1_\d{12}_\d{12}\.svg$/);
      expect(markup).toContain('>atlas_metric_3 + atlas_metric_1</text>');
      expect(markup.split('\n').filter((line) => line.startsWith('<path'))).toHaveLength(2);
    });

    it('exportAllCharts draws a merged chart as one of the charts on the canvas', async () => {
      stubImageLoading('load');
      stubCanvasEncoding(PNG);
      await configure({}, undefined, MERGED_CANVAS);

      await store.exportAllCharts();

      expect(gateway.fetchSeries).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s3', 's1', 's5'], columns: 960 }));
    });
  });
});
