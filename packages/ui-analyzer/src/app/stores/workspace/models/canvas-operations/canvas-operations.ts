import type { WorkspaceMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { mergedChart, normalizedChart, type TraitsOf, type UnitOf } from '../chart-axes/chart-axes';
import {
  type Canvas,
  canvasSeriesIdsOf,
  chartIdOf,
  chartIdsOf,
  chartOf,
  chartPlotting,
  chartWithId,
  isMergedChart,
  isOnCanvas,
  type PlottedChart,
  plotsSeries,
  seriesIdsOf,
} from '../plotted-chart/plotted-chart';

export const MAXIMUM_CHART_SERIES = 5;

const BEFORE_LIMIT = 0.25;
const AFTER_LIMIT = 0.75;
const MISSING = -1;

export const DROP_POSITIONS = {
  BEFORE: 'before',
  MERGE: 'merge',
  AFTER: 'after',
} as const;

export type DropPosition = ValueOf<typeof DROP_POSITIONS>;

export const DRAG_ORIGINS = {
  LIBRARY: 'library',
  CANVAS: 'canvas',
} as const;

export type DragOrigin = ValueOf<typeof DRAG_ORIGINS>;

export type DraggedItem = {
  readonly origin: DragOrigin;
  readonly seriesId: string;
};

export type DropTarget = {
  readonly chartId: string;
  readonly position: DropPosition;
};

export const CANVAS_REFUSALS = {
  CHART_FULL: 'chart-full',
} as const;

export type CanvasRefusal = ValueOf<typeof CANVAS_REFUSALS>;

const REFUSAL_MESSAGES: Readonly<Record<CanvasRefusal, (messages: WorkspaceMessages) => string>> = {
  [CANVAS_REFUSALS.CHART_FULL]: (messages) => messages.chartSeriesLimit,
};

export const refusalMessageOf = (refusal: CanvasRefusal, messages: WorkspaceMessages): string => REFUSAL_MESSAGES[refusal](messages);

export type CanvasOutcome = {
  readonly canvas: Canvas;
  readonly refusal: CanvasRefusal | null;
};

export const dropPositionAt = (verticalFraction: number): DropPosition => {
  if (verticalFraction < BEFORE_LIMIT) {
    return DROP_POSITIONS.BEFORE;
  }

  return verticalFraction > AFTER_LIMIT ? DROP_POSITIONS.AFTER : DROP_POSITIONS.MERGE;
};

const movingChartOf = (canvas: Canvas, draggedSeriesId: string): PlottedChart => chartPlotting(canvas, draggedSeriesId) ?? chartOf(draggedSeriesId);

export const dropTargetFor = (canvas: Canvas, dragged: DraggedItem, targetChartId: string, verticalFraction: number): DropTarget | null =>
  chartIdOf(movingChartOf(canvas, dragged.seriesId)) === targetChartId ? null : { chartId: targetChartId, position: dropPositionAt(verticalFraction) };

export const normalizedCanvas = (canvas: Canvas, unitOf: UnitOf): Canvas => R.map(canvas, (chart) => normalizedChart(chart, unitOf));

export const withChartAdded = (canvas: Canvas, seriesId: string): Canvas => [...canvas, chartOf(seriesId)];

export const openedFromLibrary = (canvas: Canvas, seriesId: string): Canvas => (isOnCanvas(canvas, seriesId) ? canvas : withChartAdded(canvas, seriesId));

export const withSeriesPlotted = (canvas: Canvas, seriesIds: readonly string[]): Canvas =>
  R.pipe(
    seriesIds,
    R.unique(),
    R.filter((seriesId) => !isOnCanvas(canvas, seriesId)),
    R.reduce(withChartAdded, canvas),
  );

export const withoutChart = (canvas: Canvas, chartId: string): Canvas => R.filter(canvas, (chart) => chartIdOf(chart) !== chartId);

export const withoutSeries = (canvas: Canvas, seriesId: string, unitOf: UnitOf): Canvas =>
  R.pipe(
    canvas,
    R.map((chart) =>
      plotsSeries(chart, seriesId) ? normalizedChart({ ...chart, plotted: R.filter(chart.plotted, (entry) => entry.seriesId !== seriesId) }, unitOf) : chart,
    ),
    R.filter((chart) => chart.plotted.length > 0),
  );

export const withSeriesMergedFirst = (canvas: Canvas, seriesIds: readonly string[], traitsOf: TraitsOf): Canvas => {
  const unique = R.unique(seriesIds);
  const [lead, ...merging] = unique.slice(0, MAXIMUM_CHART_SERIES);

  if (lead === undefined || merging.length === 0) {
    return withSeriesPlotted(canvas, unique);
  }

  const unitOf: UnitOf = (seriesId) => traitsOf(seriesId).unit;
  const remaining = R.reduce([lead, ...merging], (rest, seriesId) => withoutSeries(rest, seriesId, unitOf), canvas);
  const merged = R.reduce(merging, (chart, seriesId) => mergedChart(chart, chartOf(seriesId), traitsOf), chartOf(lead));

  return withSeriesPlotted([merged, ...remaining], unique.slice(MAXIMUM_CHART_SERIES));
};

export const activeAfterRemoval = (remaining: Canvas, activeSeriesId: string | null): string | null =>
  activeSeriesId !== null && isOnCanvas(remaining, activeSeriesId) ? activeSeriesId : (R.first(canvasSeriesIdsOf(remaining)) ?? null);

const inserted = (canvas: Canvas, moving: PlottedChart, targetChartId: string, position: DropPosition): Canvas => {
  const movingChartId = chartIdOf(moving);

  if (movingChartId === targetChartId) {
    return canvas;
  }

  const remaining = withoutChart(canvas, movingChartId);
  const targetIndex = chartIdsOf(remaining).indexOf(targetChartId);
  const anchorIndex = targetIndex === MISSING ? remaining.length : targetIndex;
  const insertionIndex = position === DROP_POSITIONS.AFTER ? anchorIndex + 1 : anchorIndex;

  return [...remaining.slice(0, insertionIndex), moving, ...remaining.slice(insertionIndex)];
};

const merged = (canvas: Canvas, moving: PlottedChart, targetChartId: string, traitsOf: TraitsOf): CanvasOutcome => {
  const movingChartId = chartIdOf(moving);
  const target = chartWithId(canvas, targetChartId);

  if (target === undefined || movingChartId === targetChartId) {
    return { canvas, refusal: null };
  }

  if (target.plotted.length + moving.plotted.length > MAXIMUM_CHART_SERIES) {
    return { canvas, refusal: CANVAS_REFUSALS.CHART_FULL };
  }

  const combined = mergedChart(target, moving, traitsOf);

  return {
    canvas: R.pipe(
      withoutChart(canvas, movingChartId),
      R.map((chart) => (chartIdOf(chart) === targetChartId ? combined : chart)),
    ),
    refusal: null,
  };
};

export const droppedOnto = (canvas: Canvas, draggedSeriesId: string, target: DropTarget, traitsOf: TraitsOf): CanvasOutcome => {
  const moving = movingChartOf(canvas, draggedSeriesId);

  if (target.position === DROP_POSITIONS.MERGE) {
    return merged(canvas, moving, target.chartId, traitsOf);
  }

  return { canvas: inserted(canvas, moving, target.chartId, target.position), refusal: null };
};

export const separatedChart = (canvas: Canvas, chartId: string): Canvas => {
  const index = chartIdsOf(canvas).indexOf(chartId);
  const chart = canvas[index];

  if (chart === undefined || !isMergedChart(chart)) {
    return canvas;
  }

  return [...canvas.slice(0, index), ...R.map(seriesIdsOf(chart), chartOf), ...canvas.slice(index + 1)];
};
