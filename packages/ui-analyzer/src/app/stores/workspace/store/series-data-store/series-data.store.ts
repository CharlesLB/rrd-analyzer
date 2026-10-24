import { computed, effect, inject, linkedSignal, resource, Service, signal, type WritableSignal } from '@angular/core';
import * as R from 'remeda';
import { keptResourceValue } from '../../../../shared/utils/kept-resource-value/kept-resource-value.util';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { WorkspaceRepository } from '../../data-access/workspace-repository/workspace.repository';
import type { WindowQuery } from '../../data-access/workspace-repository/workspace.types';
import { withUnchangedEntriesKept } from '../../models/library-entry/library-entry';
import { chartIdOf, type PlottedChart } from '../../models/plotted-chart/plotted-chart';
import {
  type CanvasChart,
  type CanvasOverview,
  type ChartData,
  type ChartLine,
  type LibraryEntry,
  plottedLinesOf,
  type SampleTracks,
  type SeriesSample,
  type SeriesStatistics,
} from '../../models/series/series.model';
import { CHART_COLUMNS, OVERVIEW_COLUMNS, THUMBNAIL_COLUMNS } from '../../models/timeframe/timeframe';
import {
  mergedChartData,
  rememberedWindow,
  seriesMissingFrom,
  seriesWindowKeyOf,
  type WindowMemory,
  windowKeyOf,
} from '../../models/window-memory/window-memory';
import { WorkspaceStore } from '../workspace-store/workspace.store';

const NO_WINDOW_YET = 0;
const EMPTY_CHART_DATA: ChartData = { tracks: {}, statistics: {} };
const EMPTY_TRACKS: SampleTracks = {};
const EMPTY_SAMPLES: readonly SeriesSample[] = [];

@Service({ autoProvided: false })
export class SeriesDataStore {
  private readonly _repository = inject(WorkspaceRepository);
  private readonly _workspace = inject(WorkspaceStore);
  private readonly _timeWindow = inject(TimeWindowStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _canvasSeriesIdSet = computed<ReadonlySet<string>>(() => new Set(this._workspace.canvasSeriesIds()));

  private readonly _chartQuery = computed<WindowQuery | undefined>(() => this._windowQuery(this._workspace.canvasSeriesIds(), CHART_COLUMNS), {
    equal: R.isDeepEqual,
  });

  private readonly _thumbnailQuery = computed<WindowQuery | undefined>(
    () =>
      this._boundsQuery(
        R.map(this._workspace.series(), (series) => series.id),
        THUMBNAIL_COLUMNS,
      ),
    { equal: R.isDeepEqual },
  );

  private readonly _overviewSeriesId = computed<string | null>(() => {
    const leadChart = R.first(this._workspace.canvas());

    return leadChart === undefined ? null : chartIdOf(leadChart);
  });

  private readonly _overviewQuery = computed<WindowQuery | undefined>(
    () => {
      const leadSeriesId = this._overviewSeriesId();

      return leadSeriesId === null ? undefined : this._boundsQuery([leadSeriesId], OVERVIEW_COLUMNS);
    },
    { equal: R.isDeepEqual },
  );

  private readonly _chartMemoryState = signal<WindowMemory<ChartData>>({});
  private readonly _thumbnailMemoryState = signal<WindowMemory<SampleTracks>>({});
  private readonly _overviewMemoryState = signal<WindowMemory<SampleTracks>>({});

  private readonly _chartDataResource = resource({
    params: () => this._chartQuery(),
    loader: async ({ params }) => await this._loadChart(params),
  });

  private readonly _thumbnailTracksResource = resource({
    params: () => this._thumbnailQuery(),
    loader: async ({ params }) => await this._loadTracks(params, this._thumbnailMemoryState),
  });

  private readonly _overviewTracksResource = resource({
    params: () => this._overviewQuery(),
    loader: async ({ params }) => await this._loadTracks(params, this._overviewMemoryState),
  });

  private readonly _chartData = keptResourceValue(this._chartDataResource, EMPTY_CHART_DATA, () => this._workspace.analysisId());
  private readonly _thumbnailTracks = keptResourceValue(this._thumbnailTracksResource, EMPTY_TRACKS, () => this._workspace.analysisId());
  private readonly _overviewTracks = keptResourceValue(this._overviewTracksResource, EMPTY_TRACKS, () => this._workspace.analysisId());

  public readonly canvasCharts = computed<readonly CanvasChart[]>(() =>
    R.pipe(
      this._workspace.canvas(),
      R.map((chart) => ({ id: chartIdOf(chart), lines: this._linesOf(chart), referenceLines: chart.referenceLines })),
      R.filter((chart) => chart.lines.length > 0),
    ),
  );

  public readonly canvasOverview = computed<CanvasOverview | null>(() => {
    const leadSeriesId = this._overviewSeriesId();

    if (leadSeriesId === null) {
      return null;
    }

    const series = this._workspace.seriesById().get(leadSeriesId);
    const samples = this._overviewTracks()[leadSeriesId];

    return series === undefined || samples === undefined ? null : { samples, color: series.color };
  });

  private readonly _keptLibraryEntries = linkedSignal<readonly LibraryEntry[], readonly LibraryEntry[]>({
    source: () => this._libraryEntriesAsRead(),
    computation: (entries, previous) => (previous === undefined ? entries : withUnchangedEntriesKept(entries, previous.value)),
  });

  public readonly libraryEntries = this._keptLibraryEntries.asReadonly();

  public constructor() {
    effect(() => {
      if (this._chartDataResource.error() !== undefined || this._thumbnailTracksResource.error() !== undefined) {
        this._toasts.showFailure(this._texts().workspace.seriesUnavailable);
      }
    });
  }

  private _libraryEntriesAsRead(): readonly LibraryEntry[] {
    const needle = this._workspace.libraryFilter().trim().toLowerCase();
    const onCanvas = this._canvasSeriesIdSet();
    const tracks = this._thumbnailTracks();
    const activeSeriesId = this._workspace.activeSeriesId();

    return R.pipe(
      this._workspace.series(),
      R.filter((series) => needle === '' || series.name.toLowerCase().includes(needle)),
      R.map((series) => ({
        series,
        samples: tracks[series.id] ?? EMPTY_SAMPLES,
        isOnCanvas: onCanvas.has(series.id),
        isActive: onCanvas.has(series.id) && activeSeriesId === series.id,
      })),
    );
  }

  public async fetchTracks(query: WindowQuery): Promise<SampleTracks> {
    return await this._repository.fetchTracks(query);
  }

  public statisticsOf(seriesId: string): SeriesStatistics | null {
    return this._chartData().statistics[seriesId] ?? null;
  }

  private _linesOf(chart: PlottedChart): readonly ChartLine[] {
    const { tracks, statistics } = this._chartData();

    return R.map(plottedLinesOf(chart, this._workspace.seriesById()), (line) => ({
      ...line,
      samples: tracks[line.series.id] ?? EMPTY_SAMPLES,
      statistics: statistics[line.series.id] ?? null,
    }));
  }

  private _windowQuery(seriesIds: readonly string[], columns: number): WindowQuery | undefined {
    const analysisId = this._workspace.analysisId();
    const visibleWindow = this._timeWindow.queriedWindow();

    return analysisId === '' || visibleWindow.untilMilliseconds === NO_WINDOW_YET
      ? undefined
      : { analysisId, seriesIds: R.sortBy(seriesIds, R.identity()), ...visibleWindow, columns };
  }

  private _boundsQuery(seriesIds: readonly string[], columns: number): WindowQuery | undefined {
    const analysisId = this._workspace.analysisId();
    const dataBounds = this._timeWindow.bounds();

    return analysisId === '' || dataBounds.untilMilliseconds === NO_WINDOW_YET
      ? undefined
      : { analysisId, seriesIds: R.sortBy(seriesIds, R.identity()), ...dataBounds, columns };
  }

  private async _loadChart(query: WindowQuery): Promise<ChartData> {
    const key = windowKeyOf(query);
    const missing = seriesMissingFrom(this._chartMemoryState()[key] ?? EMPTY_CHART_DATA, query.seriesIds);
    const fetched = missing.length === 0 ? null : await this._repository.fetchChart({ ...query, seriesIds: missing });
    const held = this._chartMemoryState()[key] ?? EMPTY_CHART_DATA;
    const chart = fetched === null ? held : mergedChartData(held, fetched);

    this._chartMemoryState.update((memory) => rememberedWindow(memory, key, chart));

    return chart;
  }

  private async _loadTracks(query: WindowQuery, memory: WritableSignal<WindowMemory<SampleTracks>>): Promise<SampleTracks> {
    const key = seriesWindowKeyOf(query);
    const tracks = memory()[key] ?? (await this._repository.fetchTracks(query));

    memory.update((held) => rememberedWindow(held, key, tracks));

    return tracks;
  }
}
