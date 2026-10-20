import * as R from 'remeda';
import { type StatisticKey, withStatisticToggled } from '../statistic-key/statistic-key';

export const FIRST_AXIS = 0;

export type PlottedSeries = {
  readonly seriesId: string;
  readonly axis: number;
};

export type PlottedChart = {
  readonly plotted: readonly PlottedSeries[];
  readonly referenceLines: readonly StatisticKey[];
};

export type Canvas = readonly PlottedChart[];

export const chartOf = (seriesId: string): PlottedChart => ({ plotted: [{ seriesId, axis: FIRST_AXIS }], referenceLines: [] });

export const chartIdOf = (chart: PlottedChart): string => R.first(chart.plotted)?.seriesId ?? '';

export const seriesIdsOf = (chart: PlottedChart): readonly string[] => R.map(chart.plotted, (entry) => entry.seriesId);

export const plotsSeries = (chart: PlottedChart, seriesId: string): boolean => chart.plotted.some((entry) => entry.seriesId === seriesId);

export const isMergedChart = (chart: PlottedChart): boolean => chart.plotted.length > 1;

export const chartIdsOf = (canvas: Canvas): readonly string[] => R.map(canvas, chartIdOf);

export const canvasSeriesIdsOf = (canvas: Canvas): readonly string[] => R.flatMap(canvas, seriesIdsOf);

export const isOnCanvas = (canvas: Canvas, seriesId: string): boolean => canvas.some((chart) => plotsSeries(chart, seriesId));

export const chartWithId = (canvas: Canvas, chartId: string): PlottedChart | undefined => canvas.find((chart) => chartIdOf(chart) === chartId);

export const chartPlotting = (canvas: Canvas, seriesId: string): PlottedChart | undefined => canvas.find((chart) => plotsSeries(chart, seriesId));

export const withReferenceLineToggled = (canvas: Canvas, chartId: string, key: StatisticKey): Canvas =>
  R.map(canvas, (chart) => (chartIdOf(chart) === chartId ? { ...chart, referenceLines: withStatisticToggled(chart.referenceLines, key) } : chart));
