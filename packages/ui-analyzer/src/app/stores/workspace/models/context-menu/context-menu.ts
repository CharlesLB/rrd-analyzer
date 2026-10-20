import * as R from 'remeda';
import type { Viewport } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { type Canvas, chartIdOf, type PlottedChart, plotsSeries } from '../plotted-chart/plotted-chart';
import { plottedLinesOf, type Series } from '../series/series.model';

const MENU_WIDTH_ALLOWANCE = 226;
const MENU_HEIGHT_ALLOWANCE = 194;
const MERGE_HEADING_HEIGHT_ALLOWANCE = 28;
const MERGE_ITEM_HEIGHT_ALLOWANCE = 30;
const NO_MERGE_ALLOWANCE = 0;

export type PointerPosition = {
  readonly clientX: number;
  readonly clientY: number;
};

export const pointerPositionOf = (event: MouseEvent): PointerPosition => ({ clientX: event.clientX, clientY: event.clientY });

export type ContextMenuRequest = PointerPosition & {
  readonly seriesId: string;
};

export type ContextMenuPlacement = {
  readonly seriesId: string;
  readonly x: number;
  readonly y: number;
};

const mergeAllowanceOf = (mergeTargetCount: number): number =>
  mergeTargetCount === 0 ? NO_MERGE_ALLOWANCE : MERGE_HEADING_HEIGHT_ALLOWANCE + mergeTargetCount * MERGE_ITEM_HEIGHT_ALLOWANCE;

export const placeContextMenu = (request: ContextMenuRequest, viewport: Viewport, mergeTargetCount: number): ContextMenuPlacement => ({
  seriesId: request.seriesId,
  x: Math.min(request.clientX, viewport.width - MENU_WIDTH_ALLOWANCE),
  y: Math.max(0, Math.min(request.clientY, viewport.height - MENU_HEIGHT_ALLOWANCE - mergeAllowanceOf(mergeTargetCount))),
});

export type MergeTarget = {
  readonly chartId: string;
  readonly label: string;
};

const chartLabelOf = (chart: PlottedChart, seriesById: ReadonlyMap<string, Series>, separator: string): string =>
  R.map(plottedLinesOf(chart, seriesById), (line) => line.series.label).join(separator);

export const mergeTargetsOf = (canvas: Canvas, seriesId: string, seriesById: ReadonlyMap<string, Series>, separator: string): readonly MergeTarget[] =>
  R.pipe(
    canvas,
    R.filter((chart) => !plotsSeries(chart, seriesId)),
    R.map((chart) => ({ chartId: chartIdOf(chart), label: chartLabelOf(chart, seriesById, separator) })),
  );
