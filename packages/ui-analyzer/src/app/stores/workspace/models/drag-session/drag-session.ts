import * as R from 'remeda';
import { DROP_RESULTS, type DropResult, droppedInto, IGNORED_DROP } from '../canvas-drop/canvas-drop';
import { DROP_POSITIONS, type DraggedItem, type DropTarget, dropTargetFor } from '../canvas-operations/canvas-operations';
import type { TraitsOf } from '../chart-axes/chart-axes';
import { type Canvas, chartIdOf, chartOf, chartPlotting } from '../plotted-chart/plotted-chart';

export type DragSession = {
  readonly dragged: DraggedItem;
  readonly dropTarget: DropTarget | null;
};

export const startedSession = (dragged: DraggedItem): DragSession => ({ dragged, dropTarget: null });

export const draggedOver = (session: DragSession, canvas: Canvas, targetChartId: string, verticalFraction: number): DragSession => {
  const dropTarget = dropTargetFor(canvas, session.dragged, targetChartId, verticalFraction);

  return R.isDeepEqual(session.dropTarget, dropTarget) ? session : { ...session, dropTarget };
};

export const leftChart = (session: DragSession, chartId: string): DragSession =>
  session.dropTarget?.chartId === chartId ? { ...session, dropTarget: null } : session;

export const droppedOnChart = (session: DragSession | null, canvas: Canvas, chartId: string, traitsOf: TraitsOf): DropResult =>
  session === null || session.dropTarget === null || session.dropTarget.chartId !== chartId
    ? IGNORED_DROP
    : droppedInto(canvas, session.dragged.seriesId, session.dropTarget, traitsOf);

export const droppedOnCanvasBackground = (session: DragSession | null, canvas: Canvas, traitsOf: TraitsOf): DropResult => {
  const lastChart = R.last(canvas);

  if (session === null) {
    return IGNORED_DROP;
  }

  if (lastChart === undefined) {
    return { kind: DROP_RESULTS.PLACED, canvas: [chartOf(session.dragged.seriesId)], activeSeriesId: session.dragged.seriesId };
  }

  const isAlreadyLast = chartPlotting(canvas, session.dragged.seriesId) === lastChart;

  return isAlreadyLast
    ? IGNORED_DROP
    : droppedInto(canvas, session.dragged.seriesId, { chartId: chartIdOf(lastChart), position: DROP_POSITIONS.AFTER }, traitsOf);
};
