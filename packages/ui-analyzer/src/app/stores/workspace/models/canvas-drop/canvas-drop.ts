import { type CanvasRefusal, DROP_POSITIONS, type DropTarget, droppedOnto } from '../canvas-operations/canvas-operations';
import type { TraitsOf } from '../chart-axes/chart-axes';
import { type Canvas, chartOf, chartPlotting, seriesIdsOf } from '../plotted-chart/plotted-chart';

export const DROP_RESULTS = {
  IGNORED: 'ignored',
  REFUSED: 'refused',
  PLACED: 'placed',
  MERGED: 'merged',
} as const;

export type DropResult =
  | { readonly kind: typeof DROP_RESULTS.IGNORED }
  | { readonly kind: typeof DROP_RESULTS.REFUSED; readonly refusal: CanvasRefusal }
  | { readonly kind: typeof DROP_RESULTS.PLACED; readonly canvas: Canvas; readonly activeSeriesId: string }
  | {
      readonly kind: typeof DROP_RESULTS.MERGED;
      readonly canvas: Canvas;
      readonly activeSeriesId: string;
      readonly mergedSeriesIds: readonly string[];
      readonly targetChartId: string;
    };

export const IGNORED_DROP: DropResult = { kind: DROP_RESULTS.IGNORED };

export const droppedInto = (canvas: Canvas, draggedSeriesId: string, target: DropTarget, traitsOf: TraitsOf): DropResult => {
  const outcome = droppedOnto(canvas, draggedSeriesId, target, traitsOf);

  if (outcome.refusal !== null) {
    return { kind: DROP_RESULTS.REFUSED, refusal: outcome.refusal };
  }

  if (target.position === DROP_POSITIONS.MERGE) {
    return {
      kind: DROP_RESULTS.MERGED,
      canvas: outcome.canvas,
      activeSeriesId: draggedSeriesId,
      mergedSeriesIds: seriesIdsOf(chartPlotting(canvas, draggedSeriesId) ?? chartOf(draggedSeriesId)),
      targetChartId: target.chartId,
    };
  }

  return { kind: DROP_RESULTS.PLACED, canvas: outcome.canvas, activeSeriesId: draggedSeriesId };
};

export const mergedIntoChart = (canvas: Canvas, seriesId: string, targetChartId: string, traitsOf: TraitsOf): DropResult =>
  droppedInto(canvas, seriesId, { chartId: targetChartId, position: DROP_POSITIONS.MERGE }, traitsOf);
