import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, bundleDtoFixture, provideGatewayStub, statisticsDtoFixture } from '../../../../core/gateway/analyzer.gateway.fixture';
import { chartFixture } from '../../models/plotted-chart/plotted-chart.fixture';
import { seriesFixture } from '../../models/series/series.fixture';
import { STATISTIC_KEYS } from '../../models/statistic-key/statistic-key';
import { WorkspaceRepository } from './workspace.repository';

const QUERY = { analysisId: 'a1', seriesIds: ['s0', 's1'], fromMilliseconds: 1000.4, untilMilliseconds: 2000.6, columns: 260 };

describe('WorkspaceRepository', () => {
  let gateway: AnalyzerGateway;
  let repository: WorkspaceRepository;

  beforeEach(() => {
    gateway = analyzerGatewayStub({
      openAnalysis: vi.fn().mockResolvedValue(
        bundleDtoFixture(2, {
          canvas: [
            {
              series: [
                { seriesId: 's1', axis: 0 },
                { seriesId: 's0', axis: 1 },
              ],
            },
          ],
        }),
      ),
      fetchChart: vi.fn().mockResolvedValue({
        windows: [
          { seriesId: 's0', samples: [1, 2, 3] },
          { seriesId: 's1', samples: [null, null, null] },
        ],
        statistics: [statisticsDtoFixture('s0'), { ...statisticsDtoFixture('s1'), hasData: false }],
      }),
    });
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    repository = TestBed.inject(WorkspaceRepository);
  });

  it('opens an analysis into its series, its saved canvas of charts and the axes their series are read against, and its data bounds', async () => {
    const bundle = await repository.openAnalysis('a1');

    expect(bundle.series.map((series) => series.id)).toEqual(['s0', 's1']);
    expect(bundle.canvas).toEqual([chartFixture({ seriesId: 's1', axis: 0 }, { seriesId: 's0', axis: 1 })]);
    expect(bundle.untilMilliseconds).toBeGreaterThan(bundle.fromMilliseconds);
  });

  it('names the missing sources of an analysis by name and path, without the size the daemon stored', async () => {
    vi.mocked(gateway.missingSources).mockResolvedValueOnce([{ name: 'cpu.rrd', path: '/data/cpu.rrd', size: 10 }]);

    const missing = await repository.missingSources('a1');

    expect(gateway.missingSources).toHaveBeenCalledWith('a1');
    expect(missing).toEqual([{ name: 'cpu.rrd', path: '/data/cpu.rrd' }]);
  });

  it('keys the fetched columns by series and sends whole milliseconds', async () => {
    const tracks = await repository.fetchTracks(QUERY);

    expect(tracks).toEqual({ s0: [1, 2, 3], s1: [1, 2, 3] });
    expect(gateway.fetchSeries).toHaveBeenCalledWith({ ...QUERY, fromMilliseconds: 1000, untilMilliseconds: 2001 });
  });

  it('fetches the canvas columns and their statistics in one request, a series with no data reading as no statistics at all', async () => {
    const chart = await repository.fetchChart(QUERY);

    expect(gateway.fetchChart).toHaveBeenCalledTimes(1);
    expect(gateway.fetchChart).toHaveBeenCalledWith({ ...QUERY, fromMilliseconds: 1000, untilMilliseconds: 2001 });
    expect(chart.tracks).toEqual({ s0: [1, 2, 3], s1: [null, null, null] });
    expect(chart.statistics['s0']?.average).toBe(2);
    expect(chart.statistics['s1']).toBeNull();
  });

  it('asks the transport for nothing when no series is wanted', async () => {
    expect(await repository.fetchTracks({ ...QUERY, seriesIds: [] })).toEqual({});
    expect(await repository.fetchChart({ ...QUERY, seriesIds: [] })).toEqual({ tracks: {}, statistics: {} });
    expect(gateway.fetchSeries).not.toHaveBeenCalled();
    expect(gateway.fetchChart).not.toHaveBeenCalled();
  });

  it('saveCanvas names each chart by its first series and lists the series merged into it with the axis each is read against', async () => {
    const seriesById = new Map([seriesFixture(0), seriesFixture(1), seriesFixture(3)].map((series) => [series.id, series] as const));

    const canvas = [
      {
        plotted: [
          { seriesId: 's1', axis: 0 },
          { seriesId: 's0', axis: 1 },
        ],
        referenceLines: [STATISTIC_KEYS.AVERAGE],
      },
      { plotted: [{ seriesId: 's3', axis: 0 }], referenceLines: [] },
    ];

    await repository.saveCanvas('a1', canvas, seriesById);

    expect(gateway.saveCanvas).toHaveBeenCalledWith('a1', [
      { seriesId: 's1', label: 'metric_1', merged: [{ seriesId: 's0', label: 'metric_0', axis: 1 }], referenceLines: [STATISTIC_KEYS.AVERAGE] },
      { seriesId: 's3', label: 'metric_3', merged: [], referenceLines: [] },
    ]);
  });

  it('saveCanvas names a chart whose series the library no longer holds by the identifier of that series', async () => {
    const canvas = [chartFixture({ seriesId: 's9', axis: 0 })];

    await repository.saveCanvas('a1', canvas, new Map());

    expect(gateway.saveCanvas).toHaveBeenCalledWith('a1', [{ seriesId: 's9', label: 's9', merged: [], referenceLines: [] }]);
  });

  it('saveLibraryOrder hands the transport every series of the library, in the order it is listed', async () => {
    await repository.saveLibraryOrder('a1', [seriesFixture(2), seriesFixture(1)]);

    expect(gateway.saveLibraryOrder).toHaveBeenCalledWith('a1', [
      { seriesId: 's2', label: 'metric_2' },
      { seriesId: 's1', label: 'metric_1' },
    ]);
  });
});
