import { TestBed } from '@angular/core/testing';
import { MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleDto, PlottedChartDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { bundleDtoFixture, chartsDtoFixture } from '../../../../core/gateway/analyzer.gateway.fixture';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { chartIdsOf } from '../../models/plotted-chart/plotted-chart';
import { OVERVIEW_COLUMNS, THUMBNAIL_COLUMNS } from '../../models/timeframe/timeframe';
import type { CanvasDragStore } from '../canvas-drag-store/canvas-drag.store';
import type { WorkspaceStore } from '../workspace-store/workspace.store';
import { openWorkspace } from '../workspace-store/workspace.store.fixture';
import type { SeriesDataStore } from './series-data.store';

const THUMBNAILS_AND_OVERVIEW = 2;

describe('SeriesDataStore', () => {
  let gateway: AnalyzerGateway;
  let workspace: WorkspaceStore;
  let seriesData: SeriesDataStore;
  let canvasDrag: CanvasDragStore;

  const chartIds = (): readonly string[] => chartIdsOf(workspace.canvas());

  const configure = async (canvas: readonly PlottedChartDto[]) => {
    ({ gateway, workspace, seriesData, canvasDrag } = await openWorkspace(canvas));
  };

  describe('over the window', () => {
    beforeEach(async () => {
      await configure(chartsDtoFixture('s2', 's0'));
    });

    it('reads the canvas charts and their statistics over the window, and every library thumbnail over the whole data', async () => {
      await vi.waitFor(() => expect(seriesData.canvasCharts()[0]?.lines[0]?.samples).toEqual([1, 2, 3]));
      await vi.waitFor(() => expect(seriesData.canvasCharts()[0]?.lines[0]?.statistics?.average).toBe(2));
      await vi.waitFor(() => expect(seriesData.libraryEntries()[6]?.samples).toEqual([1, 2, 3]));

      expect(seriesData.libraryEntries().filter((entry) => entry.isOnCanvas)).toHaveLength(2);
      expect(gateway.fetchSeries).toHaveBeenCalledWith(
        expect.objectContaining({ columns: THUMBNAIL_COLUMNS, ...R.pick(bundleDtoFixture(), ['fromMilliseconds', 'untilMilliseconds']) }),
      );
    });

    it('a chart becoming the active one leaves every other library entry the object it was', async () => {
      await vi.waitFor(() => expect(seriesData.libraryEntries()[6]?.samples).toEqual([1, 2, 3]));
      const before = seriesData.libraryEntries();

      workspace.commitCanvas(workspace.canvas(), 's0');

      const after = seriesData.libraryEntries();

      expect(after[0]).not.toBe(before[0]);
      expect(after[0]?.isActive).toBe(true);
      expect(after[2]).not.toBe(before[2]);
      expect(after.filter((entry, position) => entry === before[position])).toHaveLength(5);
    });

    it('narrows the library by name, whatever the case', () => {
      workspace.setLibraryFilter('  METRIC_1 ');

      expect(seriesData.libraryEntries().map((entry) => entry.series.id)).toEqual(['s1']);
    });
  });

  it('fetchTracks reads the series asked for at the resolution asked for, for whoever draws them elsewhere', async () => {
    await configure(chartsDtoFixture('s2'));

    const tracks = await seriesData.fetchTracks({ analysisId: 'a1', seriesIds: ['s4'], fromMilliseconds: 1000, untilMilliseconds: 2000, columns: 960 });

    expect(gateway.fetchSeries).toHaveBeenCalledWith({ analysisId: 'a1', seriesIds: ['s4'], fromMilliseconds: 1000, untilMilliseconds: 2000, columns: 960 });
    expect(tracks).toEqual({ s4: [1, 2, 3] });
  });

  it('opening another analysis shows none of the previous one and queries nothing until the new bundle has arrived', async () => {
    await configure(chartsDtoFixture('s2', 's0'));
    const pending: { resolve: (bundle: BundleDto) => void } = { resolve: () => undefined };
    vi.mocked(gateway.openAnalysis).mockImplementationOnce(
      async () =>
        await new Promise<BundleDto>((resolve) => {
          pending.resolve = resolve;
        }),
    );
    const chartRequests = vi.mocked(gateway.fetchChart).mock.calls.length;

    const opening = workspace.open('a2');
    await vi.waitFor(() => expect(gateway.openAnalysis).toHaveBeenCalledTimes(2));

    expect(workspace.analysisName()).toBe('');
    expect(workspace.canvas()).toEqual([]);
    expect(workspace.series()).toEqual([]);
    expect(
      vi
        .mocked(gateway.fetchChart)
        .mock.calls.slice(chartRequests)
        .every(([request]) => request.analysisId !== 'a2'),
    ).toBe(true);

    pending.resolve(bundleDtoFixture(3, { canvas: chartsDtoFixture('s1') }));
    await opening;

    expect(workspace.analysisId()).toBe('a2');
    expect(chartIds()).toEqual(['s1']);
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

    it('opens a merged chart as one chart drawing each of its series against an axis numbered from its first series', async () => {
      await vi.waitFor(() =>
        expect(seriesData.canvasCharts()[0]?.lines.map((line) => [line.series.id, line.axis, line.samples])).toEqual([
          ['s0', 0, [1, 2, 3]],
          ['s1', 1, [1, 2, 3]],
          ['s2', 0, [1, 2, 3]],
        ]),
      );

      expect(chartIds()).toEqual(['s0', 's3']);
      expect(
        seriesData
          .libraryEntries()
          .filter((entry) => entry.isOnCanvas)
          .map((entry) => entry.series.id),
      ).toEqual(['s0', 's1', 's2', 's3']);
    });

    it('asks for every series of every chart in one request', async () => {
      await vi.waitFor(() => expect(gateway.fetchChart).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s0', 's1', 's2', 's3'] })));

      expect(gateway.fetchChart).toHaveBeenCalledTimes(1);
    });
  });

  describe('requests', () => {
    const settled = async (): Promise<void> => {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
      TestBed.tick();
    };

    beforeEach(async () => {
      await configure(chartsDtoFixture('s0', 's1'));
      await vi.waitFor(() => expect(seriesData.canvasCharts()[1]?.lines[0]?.samples).toEqual([1, 2, 3]));
      await vi.waitFor(() => expect(gateway.fetchSeries).toHaveBeenCalledTimes(THUMBNAILS_AND_OVERVIEW));
    });

    it('asks once for the whole canvas, in one request for lines and statistics together', () => {
      expect(gateway.fetchChart).toHaveBeenCalledTimes(1);
      expect(gateway.fetchChart).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s0', 's1'] }));
    });

    it('reordering the charts asks for nothing', async () => {
      canvasDrag.beginDrag('s1');
      await vi.waitFor(() => expect(canvasDrag.isDragging()).toBe(true));
      canvasDrag.trackDropTarget('s0', 0.1);
      canvasDrag.dropOn('s0');
      await settled();

      expect(chartIds()).toEqual(['s1', 's0']);
      expect(gateway.fetchChart).toHaveBeenCalledTimes(1);
    });

    it('removing a chart serves the remaining ones from what is held', async () => {
      workspace.removeFromCanvas('s0');
      await settled();

      expect(seriesData.canvasCharts().map((chart) => chart.lines[0]?.samples)).toEqual([[1, 2, 3]]);
      expect(gateway.fetchChart).toHaveBeenCalledTimes(1);
    });

    it('adding a chart asks for that chart alone', async () => {
      workspace.addToCanvas('s4');

      await vi.waitFor(() => expect(gateway.fetchChart).toHaveBeenCalledTimes(2));
      expect(gateway.fetchChart).toHaveBeenLastCalledWith(expect.objectContaining({ seriesIds: ['s4'] }));
      await vi.waitFor(() =>
        expect(seriesData.canvasCharts().map((chart) => chart.lines[0]?.samples)).toEqual([
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
        ]),
      );
    });

    it('another window asks for the charts again and for no thumbnail, which the whole data already gave', async () => {
      const timeWindow = TestBed.inject(TimeWindowStore);
      await vi.waitFor(() => expect(gateway.fetchSeries).toHaveBeenCalledTimes(THUMBNAILS_AND_OVERVIEW));

      timeWindow.showTrailing(7 * 24 * MILLISECONDS_PER_HOUR);
      await vi.waitFor(() => expect(gateway.fetchChart).toHaveBeenCalledTimes(2));
      await settled();

      expect(gateway.fetchSeries).toHaveBeenCalledTimes(THUMBNAILS_AND_OVERVIEW);
    });

    it('going back to a window already seen serves the charts from what is held', async () => {
      const timeWindow = TestBed.inject(TimeWindowStore);
      timeWindow.showTrailing(7 * 24 * MILLISECONDS_PER_HOUR);
      await vi.waitFor(() => expect(gateway.fetchChart).toHaveBeenCalledTimes(2));

      timeWindow.zoomBack();
      await settled();

      expect(gateway.fetchChart).toHaveBeenCalledTimes(2);
      expect(gateway.fetchSeries).toHaveBeenCalledTimes(THUMBNAILS_AND_OVERVIEW);
      expect(seriesData.canvasCharts()[0]?.lines[0]?.samples).toEqual([1, 2, 3]);
    });

    it('sliding the window along the strip asks for the charts once, where the slide comes to rest', async () => {
      const timeWindow = TestBed.inject(TimeWindowStore);
      const start = timeWindow.window();

      const slid = (hours: number) => ({
        fromMilliseconds: start.fromMilliseconds - hours * MILLISECONDS_PER_HOUR,
        untilMilliseconds: start.untilMilliseconds - hours * MILLISECONDS_PER_HOUR,
      });

      timeWindow.setWindow(start);
      [1, 2, 3, 4, 5].forEach((hours) => {
        timeWindow.slideWindow(slid(hours));
      });
      await settled();

      expect(gateway.fetchChart).toHaveBeenCalledTimes(1);

      await vi.waitFor(() => expect(gateway.fetchChart).toHaveBeenCalledTimes(2));
      expect(gateway.fetchChart).toHaveBeenLastCalledWith(expect.objectContaining(slid(5)));
    });

    it('the strip overview reads the whole file range for the chart that leads the canvas, and follows a reorder', async () => {
      await vi.waitFor(() => expect(seriesData.canvasOverview()?.samples).toEqual([1, 2, 3]));
      expect(gateway.fetchSeries).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s0'], columns: OVERVIEW_COLUMNS }));

      canvasDrag.beginDrag('s1');
      await vi.waitFor(() => expect(canvasDrag.isDragging()).toBe(true));
      canvasDrag.trackDropTarget('s0', 0.1);
      canvasDrag.dropOn('s0');
      await settled();

      await vi.waitFor(() => expect(gateway.fetchSeries).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s1'], columns: OVERVIEW_COLUMNS })));
    });
  });
});
