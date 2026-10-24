import { TestBed } from '@angular/core/testing';
import { MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleDto, PlottedChartDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import {
  analysisDtoFixture,
  bundleDtoFixture,
  chartsDtoFixture,
  FIXTURE_UNTIL_MILLISECONDS,
  seriesDtoFixture,
} from '../../../../core/gateway/analyzer.gateway.fixture';
import { LibraryStore } from '../../../library/store/library-store/library.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import type { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { chartIdsOf } from '../../models/plotted-chart/plotted-chart';
import { chartFixture } from '../../models/plotted-chart/plotted-chart.fixture';
import { STATISTIC_KEYS } from '../../models/statistic-key/statistic-key';
import { UNKNOWN_STEP_MILLISECONDS } from '../../models/timeframe/timeframe';
import type { CanvasDragStore } from '../canvas-drag-store/canvas-drag.store';
import type { WorkspaceStore } from './workspace.store';
import { openWorkspace, referenceTo } from './workspace.store.fixture';

describe('WorkspaceStore', () => {
  let gateway: AnalyzerGateway;
  let store: WorkspaceStore;
  let canvasDrag: CanvasDragStore;
  let toasts: ToastStore;

  const chartIds = (): readonly string[] => chartIdsOf(store.canvas());

  const configure = async (canvas: readonly PlottedChartDto[], overrides: Partial<AnalyzerGateway> = {}) => {
    ({ gateway, workspace: store, canvasDrag, toasts } = await openWorkspace(canvas, overrides));
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('opening', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s2', 's0'));
    });

    it('opens on the saved canvas, its first chart active, and the last day of data', () => {
      expect(store.analysisName()).toBe('Atlas prod · capacity');
      expect(chartIds()).toEqual(['s2', 's0']);
      expect(store.activeSeriesId()).toBe('s2');
      expect(TestBed.inject(TimeWindowStore).window()).toEqual({
        fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 24 * MILLISECONDS_PER_HOUR,
        untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS,
      });
    });
  });

  describe('the open canvas', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s2', 's0'));
    });

    it('canvasSeries lists the series the canvas draws in its order, and canvasColors the color each is drawn in', () => {
      const series = store.canvasSeries();

      expect(series.map((drawn) => drawn.id)).toEqual(['s2', 's0']);
      expect(store.canvasColors()).toEqual(new Map(series.map((drawn) => [drawn.id, drawn.color] as const)));
    });

    it('toggleLibrary collapses the library and opens it again', () => {
      store.toggleLibrary();
      const isCollapsedAfterOneToggle = store.isLibraryCollapsed();

      store.toggleLibrary();

      expect(isCollapsedAfterOneToggle).toBe(true);
      expect(store.isLibraryCollapsed()).toBe(false);
    });

    it('contextMenuDetails names no menu until one is opened, then names the series and whether it is on the canvas', () => {
      const beforeOpening = store.contextMenuDetails();

      store.openContextMenu({ seriesId: 's2', x: 10, y: 20 });

      expect(beforeOpening).toBeNull();
      expect(store.contextMenuDetails()).toMatchObject({ seriesId: 's2', x: 10, y: 20, title: 'atlas_metric_2', isOnCanvas: true });
    });
  });

  describe('renaming', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s2', 's0'));
    });

    it('renaming the open analysis stores the name the daemon kept and shows it', async () => {
      const isRenamed = await store.rename('  Atlas prod · p99  ');

      expect(isRenamed).toBe(true);
      expect(gateway.renameAnalysis).toHaveBeenCalledWith('a1', '  Atlas prod · p99  ');
      expect(store.analysisName()).toBe('Atlas prod · p99');
    });

    it('renaming the open analysis shows the new name in the library as well, before it is read again', async () => {
      const library = TestBed.inject(LibraryStore);
      vi.mocked(gateway.listAnalyses).mockResolvedValue([analysisDtoFixture()]);
      await library.refresh();

      await store.rename('Atlas prod · p99');

      expect(library.analyses().map((analysis) => analysis.name)).toEqual(['Atlas prod · p99']);
    });

    it('renaming answered after another analysis was opened leaves the name on screen to the analysis now open', async () => {
      const renaming: { finish: () => void } = { finish: () => undefined };
      vi.mocked(gateway.renameAnalysis).mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            renaming.finish = () => resolve(analysisDtoFixture({ name: 'Renamed late' }));
          }),
      );

      const renamed = store.rename('Renamed late');
      await vi.waitFor(() => expect(gateway.renameAnalysis).toHaveBeenCalled());
      await store.open('a2');
      renaming.finish();

      expect(await renamed).toBe(true);
      expect(store.analysisId()).toBe('a2');
      expect(store.analysisName()).toBe('Atlas prod · capacity');
    });

    it('renaming that the daemon refuses keeps the old name and says so', async () => {
      vi.mocked(gateway.renameAnalysis).mockRejectedValueOnce(new Error('blank'));

      const isRenamed = await store.rename('   ');

      expect(isRenamed).toBe(false);
      expect(store.analysisName()).toBe('Atlas prod · capacity');
      expect(toasts.message()).toBe('the analysis could not be renamed');
    });
  });

  describe('adding sources', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s2', 's0'));
    });

    it('adds the files picked to the open analysis, reads it again on the same canvas and says how many were new', async () => {
      vi.mocked(gateway.pickSources).mockResolvedValueOnce([
        { name: 'cache.rrd', path: '/data/cache.rrd', size: 10 },
        { name: 'queue.rrd', path: '/data/queue.rrd', size: 20 },
      ]);
      vi.mocked(gateway.addSources).mockResolvedValueOnce({ analysis: analysisDtoFixture(), added: 2 });

      const isAdded = await store.addSources();

      expect(isAdded).toBe(true);
      expect(gateway.addSources).toHaveBeenCalledWith('a1', [
        { name: 'cache.rrd', path: '/data/cache.rrd', size: 10 },
        { name: 'queue.rrd', path: '/data/queue.rrd', size: 20 },
      ]);
      expect(gateway.openAnalysis).toHaveBeenCalledTimes(2);
      expect(chartIds()).toEqual(['s2', 's0']);
      expect(toasts.message()).toBe('2 files added to the analysis');
    });

    it('keeps the window zoomed into, its way back, and the canvas steps to undo, when the files added leave the data where it was', async () => {
      const timeWindow = TestBed.inject(TimeWindowStore);

      const zoomed = {
        fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 3 * MILLISECONDS_PER_HOUR,
        untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS - MILLISECONDS_PER_HOUR,
      };

      vi.mocked(gateway.addSources).mockResolvedValueOnce({ analysis: analysisDtoFixture(), added: 1 });
      timeWindow.setWindow(zoomed);
      store.addToCanvas('s4');

      await store.addSources();

      expect(timeWindow.window()).toEqual(zoomed);
      expect(timeWindow.hasZoomHistory()).toBe(true);
      expect(store.canUndo()).toBe(true);
      expect(store.activeSeriesId()).toBe('s2');
    });

    it('keeps the window zoomed into when the files added stretch the data, and the window stays within the new data', async () => {
      const timeWindow = TestBed.inject(TimeWindowStore);

      const zoomed = {
        fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 3 * MILLISECONDS_PER_HOUR,
        untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS - MILLISECONDS_PER_HOUR,
      };

      vi.mocked(gateway.addSources).mockResolvedValueOnce({ analysis: analysisDtoFixture(), added: 1 });
      timeWindow.setWindow(zoomed);
      vi.mocked(gateway.openAnalysis).mockResolvedValueOnce(
        bundleDtoFixture(7, { canvas: chartsDtoFixture('s2', 's0'), untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS + MILLISECONDS_PER_HOUR }),
      );

      await store.addSources();

      expect(timeWindow.bounds().untilMilliseconds).toBe(FIXTURE_UNTIL_MILLISECONDS + MILLISECONDS_PER_HOUR);
      expect(timeWindow.window()).toEqual(zoomed);
    });

    it('says nothing and reads nothing again when another analysis was opened while the files were being added', async () => {
      const adding: { finish: () => void } = { finish: () => undefined };
      vi.mocked(gateway.addSources).mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            adding.finish = () => resolve({ analysis: analysisDtoFixture(), added: 1 });
          }),
      );

      const added = store.addSources();
      await vi.waitFor(() => expect(gateway.addSources).toHaveBeenCalled());
      await store.open('a2');
      adding.finish();

      expect(await added).toBe(false);
      expect(gateway.openAnalysis).toHaveBeenCalledTimes(2);
      expect(gateway.openAnalysis).toHaveBeenLastCalledWith('a2');
      expect(toasts.message()).toBeNull();
    });

    it('says nothing when another analysis was opened while the analysis was being read again with its new files', async () => {
      const reading: { finish: () => void } = { finish: () => undefined };
      vi.mocked(gateway.openAnalysis).mockImplementationOnce(
        async () =>
          await new Promise<BundleDto>((resolve) => {
            reading.finish = () => resolve(bundleDtoFixture(7, { canvas: chartsDtoFixture('s2', 's0') }));
          }),
      );

      const added = store.addSources();
      await vi.waitFor(() => expect(gateway.openAnalysis).toHaveBeenCalledTimes(2));
      await store.open('a2');
      reading.finish();

      expect(await added).toBe(false);
      expect(store.analysisId()).toBe('a2');
      expect(toasts.message()).toBeNull();
    });

    it('does nothing when the dialog is dismissed', async () => {
      vi.mocked(gateway.pickSources).mockResolvedValueOnce([]);

      expect(await store.addSources()).toBe(false);
      expect(gateway.addSources).not.toHaveBeenCalled();
      expect(toasts.message()).toBeNull();
    });

    it('says so without reading the analysis again when every file picked is already in it', async () => {
      vi.mocked(gateway.addSources).mockResolvedValueOnce({ analysis: analysisDtoFixture(), added: 0 });

      expect(await store.addSources()).toBe(false);
      expect(gateway.openAnalysis).toHaveBeenCalledTimes(1);
      expect(toasts.message()).toBe('the analysis already reads every file picked');
    });

    it('says the files could not be added when the daemon refuses one of them', async () => {
      vi.mocked(gateway.addSources).mockRejectedValueOnce(new Error('unreadable'));

      expect(await store.addSources()).toBe(false);
      expect(toasts.message()).toBe('the files could not be added: one of them could not be read');
    });
  });

  it('counts each source file the open series were read from once', async () => {
    await configure(chartsDtoFixture('s2'), {
      openAnalysis: vi
        .fn()
        .mockResolvedValue(bundleDtoFixture(3, { series: [seriesDtoFixture(0), seriesDtoFixture(1), seriesDtoFixture(2, { file: 'atlas_metric_0.rrd' })] })),
    });

    expect(store.sourceFileCount()).toBe(2);
  });

  it('opening an analysis that holds no series leaves the step of the time window unknown', async () => {
    await configure(chartsDtoFixture(), { openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture(0)) });

    const step = TestBed.inject(TimeWindowStore).step();

    expect(step).toBe(UNKNOWN_STEP_MILLISECONDS);
  });

  it('opening a saved chart that merges a series the analysis no longer lists reads that series as one without a unit', async () => {
    await configure([
      {
        series: [
          { seriesId: 's1', axis: 0 },
          { seriesId: 's9', axis: 0 },
        ],
      },
    ]);

    const [chart] = store.canvas();

    expect(chart).toEqual(chartFixture({ seriesId: 's1', axis: 0 }, { seriesId: 's9', axis: 1 }));
  });

  describe('an analysis that cannot be opened', () => {
    const CPU_SOURCE = { name: 'cpu.rrd', path: '/data/cpu.rrd', size: 10 };

    it('names the files that are no longer on disk, in a failure that stays instead of a toast', async () => {
      await configure(chartsDtoFixture(), {
        openAnalysis: vi.fn().mockRejectedValue(new Error('gone')),
        missingSources: vi.fn().mockResolvedValue([CPU_SOURCE]),
      });

      expect(gateway.missingSources).toHaveBeenCalledWith('a1');
      expect(store.openingFailure()).toEqual({ missingSources: [{ name: 'cpu.rrd', path: '/data/cpu.rrd' }] });
      expect(toasts.message()).toBeNull();
    });

    it('fails without naming a file when no file is missing, or the missing ones cannot be read either', async () => {
      await configure(chartsDtoFixture(), {
        openAnalysis: vi.fn().mockRejectedValue(new Error('not an rrd')),
        missingSources: vi.fn().mockRejectedValue(new Error('unsearchable')),
      });

      expect(store.openingFailure()).toEqual({ missingSources: [] });
    });

    it('opens once the file is back and the opening is tried again, and the failure is gone', async () => {
      await configure(chartsDtoFixture('s2'), {
        openAnalysis: vi
          .fn()
          .mockRejectedValueOnce(new Error('gone'))
          .mockResolvedValue(bundleDtoFixture(3, { canvas: chartsDtoFixture('s2') })),
        missingSources: vi.fn().mockResolvedValue([CPU_SOURCE]),
      });

      await store.open('a1');

      expect(store.openingFailure()).toBeNull();
      expect(chartIds()).toEqual(['s2']);
    });

    it('keeps the failure on screen while the same analysis is tried again, and drops it as soon as another one is asked for', async () => {
      await configure(chartsDtoFixture(), {
        openAnalysis: vi.fn().mockRejectedValue(new Error('gone')),
        missingSources: vi.fn().mockResolvedValue([CPU_SOURCE]),
      });

      const retried = store.open('a1');
      const failureWhileRetrying = store.openingFailure();
      await retried;
      const another = store.open('a2');
      const failureWhileOpeningAnother = store.openingFailure();
      await another;

      expect(failureWhileRetrying).toEqual({ missingSources: [{ name: 'cpu.rrd', path: '/data/cpu.rrd' }] });
      expect(failureWhileOpeningAnother).toBeNull();
    });

    it('an analysis that opens has no failure', async () => {
      await configure(chartsDtoFixture('s2'));

      expect(store.openingFailure()).toBeNull();
    });
  });

  it('opening an analysis that cannot be read after another one empties the workspace instead of keeping the previous canvas', async () => {
    await configure(chartsDtoFixture('s2', 's0'));
    vi.mocked(gateway.openAnalysis).mockRejectedValueOnce(new Error('gone'));

    await store.open('a2');

    expect(store.analysisId()).toBe('a2');
    expect(store.analysisName()).toBe('');
    expect(store.series()).toEqual([]);
    expect(store.canvas()).toEqual([]);
    expect(store.activeSeriesId()).toBeNull();
  });

  it('an analysis that answers after a later one was opened is dropped, and the later one stays', async () => {
    await configure(chartsDtoFixture('s2', 's0'));
    const slow: { resolve: (bundle: BundleDto) => void } = { resolve: () => undefined };
    vi.mocked(gateway.openAnalysis)
      .mockImplementationOnce(
        async () =>
          await new Promise<BundleDto>((resolve) => {
            slow.resolve = resolve;
          }),
      )
      .mockResolvedValueOnce(bundleDtoFixture(3, { analysisName: 'Opened last', canvas: chartsDtoFixture('s1') }));

    const first = store.open('a2');
    await store.open('a3');
    slow.resolve(bundleDtoFixture(4, { analysisName: 'Answered late', canvas: chartsDtoFixture('s0') }));
    await first;

    expect(store.analysisId()).toBe('a3');
    expect(store.analysisName()).toBe('Opened last');
    expect(chartIds()).toEqual(['s1']);
  });

  it('reopening the analysis on screen keeps a canvas edited while it was read, instead of the copy read before the edit', async () => {
    await configure(chartsDtoFixture('s2', 's0'));
    const slow: { resolve: (bundle: BundleDto) => void } = { resolve: () => undefined };
    vi.mocked(gateway.openAnalysis).mockImplementationOnce(
      async () =>
        await new Promise<BundleDto>((resolve) => {
          slow.resolve = resolve;
        }),
    );

    const reopened = store.open('a1');
    store.addToCanvas('s4');
    await vi.waitFor(() => expect(gateway.openAnalysis).toHaveBeenCalledTimes(2));
    slow.resolve(bundleDtoFixture(7, { canvas: chartsDtoFixture('s2', 's0') }));
    await reopened;

    expect(chartIds()).toEqual(['s2', 's0', 's4']);
    expect(store.canUndo()).toBe(true);
  });

  it('reopening the analysis on screen reads it only after the canvas saves already under way have been stored', async () => {
    await configure(chartsDtoFixture('s2', 's0'));
    const save: { finish: () => void } = { finish: () => undefined };
    vi.mocked(gateway.saveCanvas).mockImplementationOnce(
      async () =>
        await new Promise<void>((resolve) => {
          save.finish = resolve;
        }),
    );

    store.addToCanvas('s4');
    await vi.waitFor(() => expect(gateway.saveCanvas).toHaveBeenCalledTimes(1));
    const reopened = store.open('a1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(gateway.openAnalysis).toHaveBeenCalledTimes(1);

    save.finish();
    await reopened;

    expect(gateway.openAnalysis).toHaveBeenCalledTimes(2);
  });

  it('an analysis that fails after a later one was opened says nothing about it', async () => {
    await configure(chartsDtoFixture('s2', 's0'));
    const slow: { reject: (reason: Error) => void } = { reject: () => undefined };
    vi.mocked(gateway.openAnalysis)
      .mockImplementationOnce(
        async () =>
          await new Promise<BundleDto>((_resolve, reject) => {
            slow.reject = reject;
          }),
      )
      .mockResolvedValueOnce(bundleDtoFixture(3, { canvas: chartsDtoFixture('s1') }));

    const first = store.open('a2');
    await store.open('a3');
    slow.reject(new Error('gone'));
    await first;

    expect(toasts.message()).not.toBe('This analysis could not be opened.');
    expect(chartIds()).toEqual(['s1']);
  });

  describe('canvas', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s0', 's1'));
    });

    it('opens a library chart after the others, makes it active and saves the canvas', async () => {
      store.openFromLibrary('s4');

      expect(chartIds()).toEqual(['s0', 's1', 's4']);
      expect(store.activeSeriesId()).toBe('s4');

      await vi.waitFor(() => expect(gateway.saveCanvas).toHaveBeenCalledWith('a1', [referenceTo(0), referenceTo(1), referenceTo(4)]));
    });

    it('a canvas the daemon cannot save stays on screen, with a notice that it may open differently next time', async () => {
      vi.mocked(gateway.saveCanvas).mockRejectedValue(new Error('disk full'));

      store.openFromLibrary('s4');

      await vi.waitFor(() => expect(toasts.message()).toBe('the canvas could not be saved, so it may open differently next time'));
      expect(chartIds()).toEqual(['s0', 's1', 's4']);
    });

    it('saves canvas changes in the order they were made, each after the one before has been stored', async () => {
      const firstSave: { release: () => void } = { release: () => undefined };
      vi.mocked(gateway.saveCanvas).mockImplementationOnce(
        async () =>
          await new Promise<void>((resolve) => {
            firstSave.release = resolve;
          }),
      );
      const savesBefore = vi.mocked(gateway.saveCanvas).mock.calls.length;

      store.addToCanvas('s2');
      store.removeFromCanvas('s2');
      await vi.waitFor(() => expect(gateway.saveCanvas).toHaveBeenCalledTimes(savesBefore + 1));
      await Promise.resolve();

      expect(gateway.saveCanvas).toHaveBeenCalledTimes(savesBefore + 1);

      firstSave.release();

      await vi.waitFor(() => expect(gateway.saveCanvas).toHaveBeenCalledTimes(savesBefore + 2));
      expect(vi.mocked(gateway.saveCanvas).mock.calls.at(-1)?.[1]).toEqual([referenceTo(0), referenceTo(1)]);
    });

    it('adds a chart, says so, and refuses one already there, but not a sixth', () => {
      store.addToCanvas('s2');

      expect(chartIds()).toEqual(['s0', 's1', 's2']);
      expect(toasts.message()).toBe('atlas_metric_2 added to canvas');

      store.addToCanvas('s2');

      expect(toasts.message()).toBe('atlas_metric_2 is already on the canvas');

      store.addToCanvas('s3');
      store.addToCanvas('s4');
      store.addToCanvas('s5');

      expect(store.canvas()).toHaveLength(6);
      expect(toasts.message()).toBe('atlas_metric_5 added to canvas');
    });

    it('a library chart opened on five charts goes after them, and no chart is replaced', () => {
      store.openFromLibrary('s2');
      store.openFromLibrary('s3');
      store.openFromLibrary('s4');

      store.openFromLibrary('s5');

      expect(chartIds()).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    });

    it('plots several series as one step to undo, keeping the active chart, past five charts', () => {
      store.plotAll(['s2', 's1', 's3']);

      expect(chartIds()).toEqual(['s0', 's1', 's2', 's3']);
      expect(store.activeSeriesId()).toBe('s0');

      store.undoCanvas();

      expect(chartIds()).toEqual(['s0', 's1']);

      store.plotAll(['s2', 's3', 's4', 's5']);

      expect(chartIds()).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    });

    it('plotting series the canvas already holds changes nothing: no save is sent and there is no step to undo', async () => {
      const canvasBefore = store.canvas();
      await new Promise((resolve) => setTimeout(resolve));
      const savesBefore = vi.mocked(gateway.saveCanvas).mock.calls.length;

      store.plotAll(['s0', 's1']);
      await new Promise((resolve) => setTimeout(resolve));

      expect(store.canvas()).toBe(canvasBefore);
      expect(gateway.saveCanvas).toHaveBeenCalledTimes(savesBefore);
      expect(store.canUndo()).toBe(false);
    });

    it('removes a chart and hands the active mark on', () => {
      store.removeFromCanvas('s0');

      expect(chartIds()).toEqual(['s1']);
      expect(store.activeSeriesId()).toBe('s1');
    });

    it('removeChart says which chart went and offers to undo it, which brings the chart back', () => {
      const before = chartIds();

      store.removeChart('s0');

      expect(chartIds()).not.toContain('s0');
      expect(toasts.message()).toBe('atlas_metric_0 removed from the canvas');
      expect(toasts.actionLabel()).toBe('Undo');

      toasts.runAction();

      expect(chartIds()).toEqual(before);
    });

    it('removeFromCanvas offers the same Undo, and removing what is not there says nothing', () => {
      store.removeFromCanvas('s6');

      expect(toasts.message()).toBeNull();

      store.removeFromCanvas('s0');

      expect(toasts.message()).toBe('atlas_metric_0 removed from the canvas');
    });

    it('removeChart of a chart the canvas does not hold changes nothing and offers no undo', () => {
      const before = store.canvas();

      store.removeChart('s6');

      expect(store.canvas()).toBe(before);
      expect(toasts.message()).toBeNull();
      expect(store.canUndo()).toBe(false);
    });

    it('toggleReferenceLine draws a statistic on one chart and saves it, and a second toggle takes it away', async () => {
      store.toggleReferenceLine('s0', STATISTIC_KEYS.AVERAGE);
      const shown = store.canvas()[0]?.referenceLines;
      await vi.waitFor(() =>
        expect(gateway.saveCanvas).toHaveBeenLastCalledWith('a1', [{ ...referenceTo(0), referenceLines: [STATISTIC_KEYS.AVERAGE] }, referenceTo(1)]),
      );

      store.toggleReferenceLine('s0', STATISTIC_KEYS.AVERAGE);

      expect(shown).toEqual([STATISTIC_KEYS.AVERAGE]);
      expect(store.canvas()[0]?.referenceLines).toEqual([]);
      expect(store.canvas()[1]?.referenceLines).toEqual([]);
    });

    it('undoCanvasIfStillShowing does nothing once the canvas has changed since the removal', () => {
      store.removeChart('s0');
      const afterRemoval = store.canvas();
      store.addToCanvas('s4');
      const changedSince = store.canvas();

      expect(store.undoCanvasIfStillShowing(afterRemoval)).toBe(false);
      expect(store.canvas()).toBe(changedSince);
    });

    it('opens a chart alone from the context menu and closes the menu', () => {
      store.openContextMenu({ seriesId: 's3', x: 10, y: 10 });
      store.openAlone('s3');

      expect(chartIds()).toEqual(['s3']);
      expect(store.contextMenu()).toBeNull();
    });

    it('toggles a chart on and off the canvas from the compact strip', () => {
      store.toggleOnCanvas('s5');

      expect(chartIds()).toContain('s5');

      store.toggleOnCanvas('s5');

      expect(chartIds()).not.toContain('s5');
    });
  });

  describe('chart heights', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s0', 's1'));
    });

    it('starts every chart at the height the canvas gives it, and keeps the one a resize sets', () => {
      expect(store.chartHeights()).toEqual({});

      store.resizeChart('s0', 420);

      expect(store.chartHeights()).toEqual({ s0: 420 });
    });

    it('fits a chart again when its height is cleared, leaving the others as they were', () => {
      store.resizeChart('s0', 420);
      store.resizeChart('s1', 180);

      store.resizeChartAutomatically('s0');

      expect(store.chartHeights()).toEqual({ s1: 180 });
    });

    it('forgets the height of a chart that leaves the canvas', () => {
      store.resizeChart('s1', 420);

      store.removeChart('s1');

      expect(store.chartHeights()).toEqual({});
    });

    it('forgets every height when another analysis is opened', async () => {
      store.resizeChart('s0', 420);

      await store.open('a2');

      expect(store.chartHeights()).toEqual({});
    });
  });

  describe('merged charts', () => {
    const mergedCanvas: readonly PlottedChartDto[] = [
      {
        series: [
          { seriesId: 's0', axis: 0 },
          { seriesId: 's1', axis: 3 },
          { seriesId: 's2', axis: 0 },
        ],
      },
      ...chartsDtoFixture('s3'),
    ];

    beforeEach(async () => {
      await configure(mergedCanvas);
    });

    it('removeFromCanvas takes one series out of the chart it is merged into and saves the chart with the series left', async () => {
      store.removeFromCanvas('s1');

      expect(store.canvas()[0]).toEqual(chartFixture({ seriesId: 's0', axis: 0 }, { seriesId: 's2', axis: 0 }));
      await vi.waitFor(() =>
        expect(gateway.saveCanvas).toHaveBeenLastCalledWith('a1', [
          { seriesId: 's0', label: 'metric_0', merged: [{ seriesId: 's2', label: 'metric_2', axis: 0 }], referenceLines: [] },
          referenceTo(3),
        ]),
      );
    });

    it('removeChart takes a merged chart off with every series it draws and hands the active mark on', () => {
      store.removeChart('s0');

      expect(chartIds()).toEqual(['s3']);
      expect(store.activeSeriesId()).toBe('s3');
    });

    it('toggleSeriesMenu opens the series menu of a merged chart with a row per series and the axes it may move to, and closes it again', () => {
      const placement = { chartId: 's0', top: 100, bottom: null, right: 40 };

      store.toggleSeriesMenu(placement);

      expect(store.seriesMenuChartId()).toBe('s0');
      expect(store.seriesMenuDetails()?.rows.map((row) => [row.series.id, row.axis, row.choices])).toEqual([
        [
          's0',
          0,
          [
            { axis: 0, isNew: false },
            { axis: 2, isNew: true },
          ],
        ],
        ['s1', 1, [{ axis: 1, isNew: false }]],
        [
          's2',
          0,
          [
            { axis: 0, isNew: false },
            { axis: 2, isNew: true },
          ],
        ],
      ]);

      store.toggleSeriesMenu(placement);

      expect(store.seriesMenuDetails()).toBeNull();
    });

    it('closeSeriesMenu closes the series menu that is open', () => {
      store.toggleSeriesMenu({ chartId: 's0', top: 100, bottom: null, right: 40 });

      store.closeSeriesMenu();

      expect(store.seriesMenuChartId()).toBeNull();
      expect(store.seriesMenuDetails()).toBeNull();
    });

    it('moveSeriesToAxis onto the axis the series is already read against changes nothing and leaves nothing to undo', () => {
      const before = store.canvas();

      store.moveSeriesToAxis('s0', 0);

      expect(store.canvas()).toBe(before);
      expect(store.canUndo()).toBe(false);
    });

    it('seriesMenuDetails names no menu for a chart of one series', () => {
      store.toggleSeriesMenu({ chartId: 's3', top: 100, bottom: null, right: 40 });

      expect(store.seriesMenuDetails()).toBeNull();
    });

    it('moveSeriesToAxis gives a series an axis of its own and saves it, the menu staying open to move the next', async () => {
      store.toggleSeriesMenu({ chartId: 's0', top: 100, bottom: null, right: 40 });

      store.moveSeriesToAxis('s2', 2);

      expect(store.canvas()[0]?.plotted).toEqual([
        { seriesId: 's0', axis: 0 },
        { seriesId: 's1', axis: 1 },
        { seriesId: 's2', axis: 2 },
      ]);
      expect(store.seriesMenuDetails()).not.toBeNull();
      await vi.waitFor(() =>
        expect(gateway.saveCanvas).toHaveBeenLastCalledWith('a1', [
          {
            seriesId: 's0',
            label: 'metric_0',
            merged: [
              { seriesId: 's1', label: 'metric_1', axis: 1 },
              { seriesId: 's2', label: 'metric_2', axis: 2 },
            ],
            referenceLines: [],
          },
          referenceTo(3),
        ]),
      );
    });

    it('separateChart puts each series of the merged chart back on a chart of its own and closes the menu', () => {
      store.toggleSeriesMenu({ chartId: 's0', top: 100, bottom: null, right: 40 });

      store.separateChart('s0');

      expect(chartIds()).toEqual(['s0', 's1', 's2', 's3']);
      expect(store.seriesMenuDetails()).toBeNull();
    });

    it('separateChart spreads a merged chart past five charts on the canvas', () => {
      store.addToCanvas('s4');
      store.addToCanvas('s5');

      store.separateChart('s0');

      expect(chartIds()).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    });

    it('addToCanvas refuses a series already merged into a chart', () => {
      store.addToCanvas('s2');

      expect(toasts.message()).toBe('atlas_metric_2 is already on the canvas');
      expect(store.canvas()).toHaveLength(2);
    });
  });

  describe('library order', () => {
    const libraryIds = (): readonly string[] => store.series().map((series) => series.id);
    const orderReferenceTo = (index: number) => ({ seriesId: `s${index}`, label: `metric_${index}` });

    beforeEach(async () => {
      await configure(chartsDtoFixture('s0'));
    });

    it('moveToTopOfLibrary lifts the series to the head of the library, closes the menu and saves the whole order', async () => {
      store.openContextMenu({ seriesId: 's4', x: 10, y: 10 });

      store.moveToTopOfLibrary('s4');

      expect(libraryIds()).toEqual(['s4', 's0', 's1', 's2', 's3', 's5', 's6']);
      expect(store.contextMenu()).toBeNull();
      await vi.waitFor(() => expect(gateway.saveLibraryOrder).toHaveBeenCalledWith('a1', [4, 0, 1, 2, 3, 5, 6].map(orderReferenceTo)));
    });

    it('moveToTopOfLibrary on the series already heading the library changes nothing and saves nothing', async () => {
      const library = store.series();

      store.moveToTopOfLibrary('s0');
      await Promise.resolve();

      expect(store.series()).toBe(library);
      expect(gateway.saveLibraryOrder).not.toHaveBeenCalled();
    });

    it('the context menu says whether its series already heads the library, filtered or not', () => {
      store.setLibraryFilter('metric_3');
      store.openContextMenu({ seriesId: 's3', x: 10, y: 10 });

      expect(store.contextMenuDetails()?.isAtTopOfLibrary).toBe(false);

      store.moveToTopOfLibrary('s3');
      store.openContextMenu({ seriesId: 's3', x: 10, y: 10 });

      expect(store.contextMenuDetails()?.isAtTopOfLibrary).toBe(true);
    });

    it('a library order the daemon cannot save stays on screen, with a notice that it may open differently next time', async () => {
      vi.mocked(gateway.saveLibraryOrder).mockRejectedValue(new Error('disk full'));

      store.moveToTopOfLibrary('s2');

      await vi.waitFor(() => expect(toasts.message()).toBe('the chart library order could not be saved, so it may open differently next time'));
      expect(libraryIds()[0]).toBe('s2');
    });
  });

  describe('series colors', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s0'));
    });

    it('recolorSeries paints the series in the color picked everywhere it is drawn, and saves it with the analysis', async () => {
      store.recolorSeries('s2', '#C8402F');

      expect(store.seriesById().get('s2')?.color).toBe('#c8402f');
      await vi.waitFor(() => expect(gateway.saveSeriesColor).toHaveBeenCalledWith('a1', { seriesId: 's2', label: 'metric_2', color: '#c8402f' }));
    });

    it('recolorSeries in the color the series already has, or of a series the analysis lacks, changes and saves nothing', async () => {
      const library = store.series();

      store.recolorSeries('s0', store.seriesById().get('s0')?.color ?? '');
      store.recolorSeries('missing', '#c8402f');
      await Promise.resolve();

      expect(store.series()).toBe(library);
      expect(gateway.saveSeriesColor).not.toHaveBeenCalled();
    });

    it('toggleColorMenu opens the palette of a series with its color, closes it on a second press, and recolorSeries closes it', () => {
      store.toggleColorMenu({ seriesId: 's2', top: 10, bottom: null, right: 20 });

      expect(store.colorMenuDetails()).toEqual({ seriesId: 's2', top: 10, bottom: null, right: 20, color: store.seriesById().get('s2')?.color });

      store.toggleColorMenu({ seriesId: 's2', top: 10, bottom: null, right: 20 });

      expect(store.colorMenuDetails()).toBeNull();

      store.toggleColorMenu({ seriesId: 's2', top: 10, bottom: null, right: 20 });
      store.recolorSeries('s2', '#c8402f');

      expect(store.colorMenuDetails()).toBeNull();
    });

    it('closeColorMenu closes the palette that is open', () => {
      store.toggleColorMenu({ seriesId: 's2', top: 10, bottom: null, right: 20 });

      store.closeColorMenu();

      expect(store.colorMenuDetails()).toBeNull();
    });

    it('a color the daemon cannot save stays on screen, with a notice that it may open in its old color', async () => {
      vi.mocked(gateway.saveSeriesColor).mockRejectedValue(new Error('disk full'));

      store.recolorSeries('s1', '#c8402f');

      await vi.waitFor(() => expect(toasts.message()).toBe('the color could not be saved, so the series may open in its old color next time'));
      expect(store.seriesById().get('s1')?.color).toBe('#c8402f');
    });
  });

  describe('undo and redo', () => {
    const merge = (chartId: string, targetChartId: string): void => {
      canvasDrag.beginChartDrag(chartId);
      vi.advanceTimersByTime(0);
      canvasDrag.trackDropTarget(targetChartId, 0.5);
      canvasDrag.dropOn(targetChartId);
    };

    beforeEach(async () => {
      vi.useFakeTimers();
      await configure(chartsDtoFixture('s0', 's1', 's2'));
    });

    it('undoCanvas after a merge brings both charts back as they were, and saves them, while redoCanvas merges them again', async () => {
      const before = store.canvas();
      merge('s2', 's0');
      const merged = store.canvas();

      store.undoCanvas();

      expect(store.canvas()).toEqual(before);
      expect(store.canRedo()).toBe(true);
      await vi.waitFor(() => expect(gateway.saveCanvas).toHaveBeenLastCalledWith('a1', [referenceTo(0), referenceTo(1), referenceTo(2)]));

      store.redoCanvas();

      expect(store.canvas()).toEqual(merged);
      expect(store.canRedo()).toBe(false);
    });

    it('undoCanvas steps back one change at a time, a series menu change and a removal included', () => {
      merge('s2', 's0');
      store.moveSeriesToAxis('s2', 1);
      store.removeChart('s1');

      store.undoCanvas();

      expect(chartIdsOf(store.canvas())).toEqual(['s0', 's1']);

      store.undoCanvas();

      expect(store.canvas()[0]?.plotted.map((entry) => entry.axis)).toEqual([0, 0]);

      store.undoCanvas();

      expect(chartIds()).toEqual(['s0', 's1', 's2']);
      expect(store.canUndo()).toBe(false);
    });

    it('undoCanvas with nothing changed since the analysis was opened changes nothing and saves nothing', async () => {
      store.undoCanvas();
      store.redoCanvas();
      await Promise.resolve();

      expect(chartIds()).toEqual(['s0', 's1', 's2']);
      expect(gateway.saveCanvas).not.toHaveBeenCalled();
    });

    it('a change made after an undo forgets what could have been redone', () => {
      merge('s2', 's0');
      store.undoCanvas();

      store.removeChart('s1');

      expect(store.canRedo()).toBe(false);
    });

    it('a change that leaves the canvas as it was is not a step to undo', () => {
      store.openFromLibrary('s1');

      expect(store.canUndo()).toBe(false);
    });

    it('the Undo of the merge toast undoes that merge, and does nothing once the canvas has changed since', () => {
      merge('s2', 's0');

      expect(toasts.actionLabel()).toBe('Undo');

      toasts.runAction();

      expect(chartIds()).toEqual(['s0', 's1', 's2']);

      merge('s2', 's0');
      store.moveSeriesToAxis('s2', 1);
      const changedSince = store.canvas();
      toasts.runAction();

      expect(store.canvas()).toBe(changedSince);
    });

    it('opening another analysis starts with nothing to undo', async () => {
      merge('s2', 's0');

      await store.open('a2');

      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });
  });
});
