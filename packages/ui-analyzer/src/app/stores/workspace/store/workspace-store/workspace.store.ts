import { computed, inject, Service, signal } from '@angular/core';
import { formatMessage, formatPlural } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { LibraryStore } from '../../../library/store/library-store/library.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { WorkspaceRepository } from '../../data-access/workspace-repository/workspace.repository';
import { type CanvasHistory, EMPTY_HISTORY, type HistoryStep, recorded, redone, undone } from '../../models/canvas-history/canvas-history';
import {
  activeAfterRemoval,
  normalizedCanvas,
  openedFromLibrary,
  separatedChart,
  withChartAdded,
  withoutChart,
  withoutSeries,
  withSeriesMergedFirst,
  withSeriesPlotted,
} from '../../models/canvas-operations/canvas-operations';
import { axisChoicesOf, type TraitsOf, withSeriesOnAxis } from '../../models/chart-axes/chart-axes';
import type { ColorMenuDetails, ColorMenuPlacement } from '../../models/color-menu/color-menu';
import { type ContextMenuPlacement, type MergeTarget, mergeTargetsOf } from '../../models/context-menu/context-menu';
import { isAtTopOfLibrary, movedToTopOfLibrary } from '../../models/library-order/library-order';
import type { MissingSource, OpeningFailure } from '../../models/opening-failure/opening-failure';
import {
  type Canvas,
  canvasSeriesIdsOf,
  chartIdsOf,
  chartOf,
  chartWithId,
  isMergedChart,
  isOnCanvas,
  type PlottedChart,
  plotsSeries,
  seriesIdsOf,
  withReferenceLineToggled,
} from '../../models/plotted-chart/plotted-chart';
import { plottedLinesOf, type Series, type SeriesBundle, seriesFor, seriesNameOf, withSeriesRecolored } from '../../models/series/series.model';
import type { SeriesMenuDetails, SeriesMenuPlacement, SeriesMenuRow } from '../../models/series-menu/series-menu';
import type { StatisticKey } from '../../models/statistic-key/statistic-key';
import { type TimeRange, UNKNOWN_STEP_MILLISECONDS } from '../../models/timeframe/timeframe';

type Opening = { readonly bundle: SeriesBundle; readonly failure: null } | { readonly bundle: null; readonly failure: OpeningFailure };

const finestStepOf = (series: readonly Series[]): number =>
  series.length === 0 ? UNKNOWN_STEP_MILLISECONDS : Math.min(...R.map(series, (candidate) => candidate.stepMilliseconds));

@Service({ autoProvided: false })
export class WorkspaceStore {
  private readonly _repository = inject(WorkspaceRepository);
  private readonly _timeWindow = inject(TimeWindowStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _library = inject(LibraryStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _analysisIdState = signal('');
  private readonly _requestedAnalysisIdState = signal('');
  private readonly _saves: { latest: Promise<void> } = { latest: Promise.resolve() };
  private readonly _analysisNameState = signal('');
  private readonly _openingFailureState = signal<OpeningFailure | null>(null);
  private readonly _seriesState = signal<readonly Series[]>([]);
  private readonly _canvasState = signal<Canvas>([]);
  private readonly _activeSeriesIdState = signal<string | null>(null);
  private readonly _libraryFilterState = signal('');
  private readonly _isLibraryCollapsedState = signal(false);
  private readonly _contextMenuState = signal<ContextMenuPlacement | null>(null);
  private readonly _seriesMenuState = signal<SeriesMenuPlacement | null>(null);
  private readonly _colorMenuState = signal<ColorMenuPlacement | null>(null);
  private readonly _historyState = signal<CanvasHistory>(EMPTY_HISTORY);
  private readonly _chartHeightsState = signal<Readonly<Record<string, number>>>({});

  public readonly analysisId = this._analysisIdState.asReadonly();
  public readonly analysisName = this._analysisNameState.asReadonly();
  public readonly openingFailure = this._openingFailureState.asReadonly();
  public readonly series = this._seriesState.asReadonly();
  public readonly canvas = this._canvasState.asReadonly();
  public readonly activeSeriesId = this._activeSeriesIdState.asReadonly();
  public readonly libraryFilter = this._libraryFilterState.asReadonly();
  public readonly isLibraryCollapsed = this._isLibraryCollapsedState.asReadonly();
  public readonly contextMenu = this._contextMenuState.asReadonly();
  public readonly chartHeights = this._chartHeightsState.asReadonly();
  public readonly seriesMenuChartId = computed(() => this._seriesMenuState()?.chartId ?? null);
  public readonly canUndo = computed(() => this._historyState().past.length > 0);
  public readonly canRedo = computed(() => this._historyState().future.length > 0);
  public readonly seriesById = computed(() => new Map(R.map(this._seriesState(), (series) => [series.id, series] as const)));
  public readonly sourceFileCount = computed(() => R.unique(R.map(this._seriesState(), (series) => series.file)).length);
  public readonly canvasSeriesIds = computed(() => canvasSeriesIdsOf(this._canvasState()));
  public readonly canvasSeries = computed(() => seriesFor(this.canvasSeriesIds(), this.seriesById()));

  public readonly canvasColors = computed<ReadonlyMap<string, string>>(
    () => new Map(R.map(this.canvasSeries(), (series) => [series.id, series.color] as const)),
  );

  public readonly contextMenuDetails = computed(() => {
    const placement = this._contextMenuState();

    return placement === null
      ? null
      : {
          ...placement,
          title: seriesNameOf(this.seriesById(), placement.seriesId),
          isOnCanvas: isOnCanvas(this._canvasState(), placement.seriesId),
          isAtTopOfLibrary: isAtTopOfLibrary(this._seriesState(), placement.seriesId),
          mergeTargets: this.mergeTargetsFor(placement.seriesId),
        };
  });

  public readonly colorMenuDetails = computed<ColorMenuDetails | null>(() => {
    const placement = this._colorMenuState();
    const series = placement === null ? undefined : this.seriesById().get(placement.seriesId);

    return placement === null || series === undefined ? null : { ...placement, color: series.color };
  });
  public readonly seriesMenuDetails = computed<SeriesMenuDetails | null>(() => {
    const placement = this._seriesMenuState();
    const chart = placement === null ? undefined : chartWithId(this._canvasState(), placement.chartId);

    return placement === null || chart === undefined || !isMergedChart(chart) ? null : { ...placement, rows: this._seriesMenuRowsOf(chart) };
  });

  public async open(analysisId: string): Promise<void> {
    const isReopening = analysisId === this._analysisIdState() && this._timeWindow.hasWindow();

    this._emptyTheWorkspaceUnlessReopeningIt(analysisId, isReopening);

    const canvasWhenAsked = this._canvasState();

    await this._saves.latest;
    const { bundle, failure } = await this._readOpening(analysisId);

    if (this._requestedAnalysisIdState() !== analysisId) {
      return;
    }

    this._analysisIdState.set(analysisId);
    this._openingFailureState.set(failure);

    if (bundle === null) {
      this._showNothing();

      return;
    }

    const shown = this._canvasState() === canvasWhenAsked ? bundle : { ...bundle, canvas: this._canvasState() };

    if (isReopening) {
      this._showBundleOnTheSameView(shown);

      return;
    }

    this._showBundle(shown);
  }

  public async rename(name: string): Promise<boolean> {
    const analysisId = this._analysisIdState();

    try {
      const renamed = await this._repository.renameAnalysis(analysisId, name);

      this._library.renamed(analysisId, renamed);

      if (this._analysisIdState() === analysisId) {
        this._analysisNameState.set(renamed);
      }

      return true;
    } catch {
      this._toasts.show(this._texts().workspace.analysisNotRenamed);

      return false;
    }
  }

  public async addSources(): Promise<boolean> {
    const analysisId = this._analysisIdState();

    try {
      const outcome = await this._repository.addPickedSources(analysisId);

      if (outcome.picked === 0) {
        return false;
      }

      if (this._requestedAnalysisIdState() !== analysisId) {
        return false;
      }

      if (outcome.added === 0) {
        this._toasts.show(this._texts().workspace.sourcesAlreadyListed);

        return false;
      }

      await this.open(analysisId);

      if (this._requestedAnalysisIdState() !== analysisId) {
        return false;
      }

      this._toasts.show(formatPlural(this._texts().workspace.sourcesAdded, outcome.added));

      return true;
    } catch {
      this._toasts.show(this._texts().workspace.sourcesNotAdded);

      return false;
    }
  }

  public setLibraryFilter(filter: string): void {
    this._libraryFilterState.set(filter);
  }

  public toggleLibrary(): void {
    this._isLibraryCollapsedState.update((isCollapsed) => !isCollapsed);
  }

  public openFromLibrary(seriesId: string): void {
    this._contextMenuState.set(null);
    this.commitCanvas(openedFromLibrary(this._canvasState(), seriesId), seriesId);
  }

  public openAlone(seriesId: string): void {
    this._contextMenuState.set(null);
    this.commitCanvas([chartOf(seriesId)], seriesId);
  }

  public addToCanvas(seriesId: string): void {
    const texts = this._texts().workspace;
    const canvas = this._canvasState();
    const name = seriesNameOf(this.seriesById(), seriesId);

    if (isOnCanvas(canvas, seriesId)) {
      this._toasts.show(formatMessage(texts.alreadyOnCanvas, { name }));

      return;
    }

    this._contextMenuState.set(null);
    this.commitCanvas(withChartAdded(canvas, seriesId), this._activeSeriesIdState());
    this._toasts.show(formatMessage(texts.addedToCanvas, { name }));
  }

  public plotAll(seriesIds: readonly string[]): void {
    this.commitCanvas(withSeriesPlotted(this._canvasState(), seriesIds), this._activeSeriesIdState());
  }

  public plotMerged(seriesIds: readonly string[], traitsOf: TraitsOf): void {
    this.commitCanvas(withSeriesMergedFirst(this._canvasState(), seriesIds, traitsOf), R.first(seriesIds) ?? this._activeSeriesIdState());
  }

  public removeFromCanvas(seriesId: string): void {
    const remaining = withoutSeries(this._canvasState(), seriesId, this._unitOf(this.seriesById()));

    this._contextMenuState.set(null);
    this._removeAndOfferUndo(remaining, [seriesId]);
  }

  public removeChart(chartId: string): void {
    const removed = chartWithId(this._canvasState(), chartId);
    const remaining = withoutChart(this._canvasState(), chartId);

    this._seriesMenuState.set(null);
    this._removeAndOfferUndo(remaining, removed === undefined ? [] : seriesIdsOf(removed));
  }

  public undoCanvasIfStillShowing(changed: Canvas): boolean {
    if (this._canvasState() !== changed) {
      return false;
    }

    this.undoCanvas();

    return true;
  }

  public toggleReferenceLine(chartId: string, key: StatisticKey): void {
    this.commitCanvas(withReferenceLineToggled(this._canvasState(), chartId, key), this._activeSeriesIdState());
  }

  public undoCanvas(): void {
    this._stepThroughHistory(undone(this._historyState(), this._canvasState()));
  }

  public redoCanvas(): void {
    this._stepThroughHistory(redone(this._historyState(), this._canvasState()));
  }

  public toggleSeriesMenu(placement: SeriesMenuPlacement): void {
    this._seriesMenuState.update((current) => (current?.chartId === placement.chartId ? null : placement));
  }

  public closeSeriesMenu(): void {
    this._seriesMenuState.set(null);
  }

  public moveSeriesToAxis(seriesId: string, axis: number): void {
    const unitOf = this._unitOf(this.seriesById());
    const canvas = R.map(this._canvasState(), (chart) => (plotsSeries(chart, seriesId) ? withSeriesOnAxis(chart, seriesId, axis, unitOf) : chart));

    if (!R.isDeepEqual(canvas, this._canvasState())) {
      this.commitCanvas(canvas, this._activeSeriesIdState());
    }
  }

  public resizeChart(chartId: string, height: number): void {
    this._chartHeightsState.update((heights) => ({ ...heights, [chartId]: height }));
  }

  public resizeChartAutomatically(chartId: string): void {
    this._chartHeightsState.update((heights) => R.omit(heights, [chartId]));
  }

  public separateChart(chartId: string): void {
    this._seriesMenuState.set(null);
    this.commitCanvas(separatedChart(this._canvasState(), chartId), this._activeSeriesIdState());
  }

  public toggleOnCanvas(seriesId: string): void {
    if (isOnCanvas(this._canvasState(), seriesId)) {
      this.removeFromCanvas(seriesId);

      return;
    }

    this.addToCanvas(seriesId);
  }

  public toggleColorMenu(placement: ColorMenuPlacement): void {
    this._colorMenuState.update((current) => (current?.seriesId === placement.seriesId ? null : placement));
  }

  public closeColorMenu(): void {
    this._colorMenuState.set(null);
  }

  public recolorSeries(seriesId: string, color: string): void {
    this._colorMenuState.set(null);

    const current = this.seriesById().get(seriesId);
    const chosenColor = color.toLowerCase();
    const analysisId = this._analysisIdState();

    if (current === undefined || current.color === chosenColor) {
      return;
    }

    this._seriesState.set(withSeriesRecolored(this._seriesState(), seriesId, chosenColor));
    this._queueSave(
      async () => await this._repository.saveSeriesColor(analysisId, { ...current, color: chosenColor }),
      this._texts().workspace.seriesColorNotSaved,
    );
  }

  public moveToTopOfLibrary(seriesId: string): void {
    const library = this._seriesState();
    const arranged = movedToTopOfLibrary(library, seriesId);

    this._contextMenuState.set(null);

    if (arranged === library) {
      return;
    }

    const analysisId = this._analysisIdState();

    this._seriesState.set(arranged);
    this._queueSave(async () => await this._repository.saveLibraryOrder(analysisId, arranged), this._texts().workspace.libraryOrderNotSaved);
  }

  public mergeTargetsFor(seriesId: string): readonly MergeTarget[] {
    return mergeTargetsOf(this._canvasState(), seriesId, this.seriesById(), this._texts().application.mergedSeparator);
  }

  public openContextMenu(placement: ContextMenuPlacement): void {
    this._contextMenuState.set(placement);
  }

  public closeContextMenu(): void {
    this._contextMenuState.set(null);
  }

  public commitCanvas(canvas: Canvas, activeSeriesId: string | null): void {
    const previous = this._canvasState();

    if (R.isDeepEqual(previous, canvas)) {
      this._activeSeriesIdState.set(activeSeriesId);

      return;
    }

    this._historyState.update((history) => recorded(history, previous));
    this._applyCanvas(canvas, activeSeriesId);
  }

  private _removeAndOfferUndo(remaining: Canvas, removedSeriesIds: readonly string[]): void {
    const texts = this._texts();
    const shown = this._canvasState();

    this.commitCanvas(remaining, activeAfterRemoval(remaining, this._activeSeriesIdState()));

    if (this._canvasState() === shown) {
      return;
    }

    const name = R.map(removedSeriesIds, (seriesId) => seriesNameOf(this.seriesById(), seriesId)).join(texts.application.mergedSeparator);

    this._toasts.show(formatMessage(texts.workspace.removedFromCanvas, { name }), {
      label: texts.workspace.undo,
      run: () => this.undoCanvasIfStillShowing(remaining),
    });
  }

  private _emptyTheWorkspaceUnlessReopeningIt(analysisId: string, isReopening: boolean): void {
    this._requestedAnalysisIdState.set(analysisId);
    this._seriesMenuState.set(null);
    this._colorMenuState.set(null);

    if (!isReopening) {
      this._historyState.set(EMPTY_HISTORY);
    }

    if (analysisId !== this._analysisIdState()) {
      this._analysisIdState.set('');
      this._openingFailureState.set(null);
      this._showNothing();
    }
  }

  private _showBundle(bundle: SeriesBundle): void {
    this._analysisNameState.set(bundle.analysisName);
    this._seriesState.set(bundle.series);

    const canvas = normalizedCanvas(bundle.canvas, this._unitOf(this.seriesById()));

    this._canvasState.set(canvas);
    this._activeSeriesIdState.set(R.first(canvasSeriesIdsOf(canvas)) ?? null);
    this._timeWindow.initialize({ fromMilliseconds: bundle.fromMilliseconds, untilMilliseconds: bundle.untilMilliseconds }, finestStepOf(bundle.series));
  }

  private _showBundleOnTheSameView(bundle: SeriesBundle): void {
    const bounds: TimeRange = { fromMilliseconds: bundle.fromMilliseconds, untilMilliseconds: bundle.untilMilliseconds };
    const stepMilliseconds = finestStepOf(bundle.series);
    const viewed = this._timeWindow.window();

    this._analysisNameState.set(bundle.analysisName);
    this._seriesState.set(bundle.series);

    const canvas = normalizedCanvas(bundle.canvas, this._unitOf(this.seriesById()));

    this._canvasState.set(canvas);
    this._activeSeriesIdState.set(activeAfterRemoval(canvas, this._activeSeriesIdState()));

    if (R.isDeepEqual(bounds, this._timeWindow.bounds()) && stepMilliseconds === this._timeWindow.step()) {
      return;
    }

    this._timeWindow.initialize(bounds, stepMilliseconds);
    this._timeWindow.setWindow(viewed);
  }

  private _showNothing(): void {
    this._chartHeightsState.set({});
    this._analysisNameState.set('');
    this._seriesState.set([]);
    this._canvasState.set([]);
    this._activeSeriesIdState.set(null);
    this._timeWindow.clear();
  }

  private _unitOf(seriesById: ReadonlyMap<string, Series>): (seriesId: string) => string {
    return (seriesId) => seriesById.get(seriesId)?.unit ?? '';
  }

  private _seriesMenuRowsOf(chart: PlottedChart): readonly SeriesMenuRow[] {
    const unitOf = this._unitOf(this.seriesById());

    return R.map(plottedLinesOf(chart, this.seriesById()), (line) => ({ ...line, choices: axisChoicesOf(chart, line.series.id, unitOf) }));
  }

  private _stepThroughHistory(step: HistoryStep | null): void {
    if (step === null) {
      return;
    }

    this._historyState.set(step.history);
    this._applyCanvas(step.canvas, activeAfterRemoval(step.canvas, this._activeSeriesIdState()));
  }

  private _applyCanvas(canvas: Canvas, activeSeriesId: string | null): void {
    this._canvasState.set(canvas);
    this._activeSeriesIdState.set(activeSeriesId);
    this._chartHeightsState.update((heights) => R.pick(heights, chartIdsOf(canvas)));

    const analysisId = this._analysisIdState();
    const seriesById = this.seriesById();

    this._queueSave(async () => await this._repository.saveCanvas(analysisId, canvas, seriesById), this._texts().workspace.canvasNotSaved);
  }

  private _queueSave(save: () => Promise<void>, failureMessage: string): void {
    this._saves.latest = this._saves.latest.then(async () => await this._saveOrWarn(save, failureMessage));
  }

  private async _saveOrWarn(save: () => Promise<void>, failureMessage: string): Promise<void> {
    try {
      await save();
    } catch {
      this._toasts.showFailure(failureMessage);
    }
  }

  private async _readOpening(analysisId: string): Promise<Opening> {
    try {
      return { bundle: await this._repository.openAnalysis(analysisId), failure: null };
    } catch {
      return { bundle: null, failure: { missingSources: await this._readMissingSources(analysisId) } };
    }
  }

  private async _readMissingSources(analysisId: string): Promise<readonly MissingSource[]> {
    try {
      return await this._repository.missingSources(analysisId);
    } catch {
      return [];
    }
  }
}
