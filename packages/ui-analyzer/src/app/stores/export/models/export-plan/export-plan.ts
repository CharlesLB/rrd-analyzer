import * as R from 'remeda';
import { type Canvas, chartWithId } from '../../../workspace/models/plotted-chart/plotted-chart';
import { chartTitleOf, type PlottedLine, plottedLinesOf, type Series } from '../../../workspace/models/series/series.model';

export type ExportChartPlan = {
  readonly lines: readonly PlottedLine[];
};

export const exportPlansOf = (canvas: Canvas, seriesById: ReadonlyMap<string, Series>, chartIds: readonly string[]): readonly ExportChartPlan[] =>
  R.pipe(
    chartIds,
    R.map((chartId) => chartWithId(canvas, chartId)),
    R.filter(R.isNonNullish),
    R.map((chart) => ({ lines: plottedLinesOf(chart, seriesById) })),
    R.filter((plan) => plan.lines.length > 0),
  );

export const planTitleOf = (plan: ExportChartPlan, separator: string): string => chartTitleOf(plan.lines, separator);
