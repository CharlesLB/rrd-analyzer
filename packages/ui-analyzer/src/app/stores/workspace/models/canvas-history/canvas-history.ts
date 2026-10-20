import * as R from 'remeda';
import type { Canvas } from '../plotted-chart/plotted-chart';

export const REMEMBERED_CANVASES = 50;

export type CanvasHistory = {
  readonly past: readonly Canvas[];
  readonly future: readonly Canvas[];
};

export type HistoryStep = {
  readonly history: CanvasHistory;
  readonly canvas: Canvas;
};

export const EMPTY_HISTORY: CanvasHistory = { past: [], future: [] };

export const recorded = (history: CanvasHistory, previous: Canvas): CanvasHistory => ({
  past: R.takeLast([...history.past, previous], REMEMBERED_CANVASES),
  future: [],
});

export const undone = (history: CanvasHistory, current: Canvas): HistoryStep | null => {
  const previous = R.last(history.past);

  return previous === undefined ? null : { history: { past: R.dropLast(history.past, 1), future: [current, ...history.future] }, canvas: previous };
};

export const redone = (history: CanvasHistory, current: Canvas): HistoryStep | null => {
  const next = R.first(history.future);

  return next === undefined ? null : { history: { past: [...history.past, current], future: R.drop(history.future, 1) }, canvas: next };
};
