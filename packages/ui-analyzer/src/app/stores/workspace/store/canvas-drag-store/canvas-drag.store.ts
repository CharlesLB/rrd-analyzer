import { computed, inject, Service, signal } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { DROP_RESULTS, type DropResult, mergedIntoChart } from '../../models/canvas-drop/canvas-drop';
import { DRAG_ORIGINS, type DraggedItem, refusalMessageOf } from '../../models/canvas-operations/canvas-operations';
import { type SeriesTraits, seriesTraitsOf } from '../../models/chart-axes/chart-axes';
import { type DragSession, draggedOver, droppedOnCanvasBackground, droppedOnChart, leftChart, startedSession } from '../../models/drag-session/drag-session';
import { seriesNameOf } from '../../models/series/series.model';
import { SeriesDataStore } from '../series-data-store/series-data.store';
import { WorkspaceStore } from '../workspace-store/workspace.store';

const NATIVE_DRAG_SETTLE_MILLISECONDS = 0;

type MergedDrop = Extract<DropResult, { readonly kind: typeof DROP_RESULTS.MERGED }>;

@Service({ autoProvided: false })
export class CanvasDragStore {
  private readonly _workspace = inject(WorkspaceStore);
  private readonly _seriesData = inject(SeriesDataStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _sessionState = signal<DragSession | null>(null);

  public readonly dropTarget = computed(() => this._sessionState()?.dropTarget ?? null);
  public readonly isDragging = computed(() => this._sessionState() !== null);

  public beginDrag(seriesId: string): void {
    this._startOnceTheNativeDragHasBegun({ origin: DRAG_ORIGINS.LIBRARY, seriesId });
  }

  public beginChartDrag(chartId: string): void {
    this._startOnceTheNativeDragHasBegun({ origin: DRAG_ORIGINS.CANVAS, seriesId: chartId });
  }

  public endDrag(): void {
    this._sessionState.set(null);
  }

  public trackDropTarget(chartId: string, verticalFraction: number): void {
    this._sessionState.update((session) => (session === null ? null : draggedOver(session, this._workspace.canvas(), chartId, verticalFraction)));
  }

  public leaveDropTarget(chartId: string): void {
    this._sessionState.update((session) => (session === null ? null : leftChart(session, chartId)));
  }

  public dropOn(chartId: string): void {
    this._settleDrop(droppedOnChart(this._sessionState(), this._workspace.canvas(), chartId, (seriesId) => this._traitsOf(seriesId)));
  }

  public dropOnCanvasBackground(): void {
    this._settleDrop(droppedOnCanvasBackground(this._sessionState(), this._workspace.canvas(), (seriesId) => this._traitsOf(seriesId)));
  }

  public mergeIntoChart(seriesId: string, targetChartId: string): void {
    this._workspace.closeContextMenu();
    this._settleDrop(mergedIntoChart(this._workspace.canvas(), seriesId, targetChartId, (mergingSeriesId) => this._traitsOf(mergingSeriesId)));
  }

  private _startOnceTheNativeDragHasBegun(dragged: DraggedItem): void {
    setTimeout(() => this._sessionState.set(startedSession(dragged)), NATIVE_DRAG_SETTLE_MILLISECONDS);
  }

  private _settleDrop(result: DropResult): void {
    this.endDrag();

    switch (result.kind) {
      case DROP_RESULTS.IGNORED:
        break;
      case DROP_RESULTS.REFUSED:
        this._toasts.show(refusalMessageOf(result.refusal, this._texts().workspace));
        break;
      case DROP_RESULTS.PLACED:
        this._workspace.commitCanvas(result.canvas, result.activeSeriesId);
        break;
      case DROP_RESULTS.MERGED:
        this._workspace.commitCanvas(result.canvas, result.activeSeriesId);
        this._toasts.show(this._mergedMessageOf(result), {
          label: this._texts().workspace.undo,
          run: () => this._workspace.undoCanvasIfStillShowing(result.canvas),
        });
        break;
    }
  }

  private _mergedMessageOf(result: MergedDrop): string {
    const texts = this._texts();
    const seriesById = this._workspace.seriesById();

    return formatMessage(texts.workspace.chartsMerged, {
      merged: R.map(result.mergedSeriesIds, (seriesId) => seriesNameOf(seriesById, seriesId)).join(texts.application.mergedSeparator),
      target: seriesNameOf(seriesById, result.targetChartId),
    });
  }

  private _traitsOf(seriesId: string): SeriesTraits {
    return seriesTraitsOf(this._workspace.seriesById().get(seriesId), this._seriesData.statisticsOf(seriesId));
  }
}
