import * as R from 'remeda';
import { isPercentUnit } from '../../../../shared/utils/value-format/value-format.util';
import { FIRST_AXIS, type PlottedChart, type PlottedSeries } from '../plotted-chart/plotted-chart';
import type { Series, SeriesStatistics } from '../series/series.model';

export const SHARED_AXIS_SPREAD = 10;

const PERCENT_SCALE = 100;

export type UnitOf = (seriesId: string) => string;

export type SeriesTraits = {
  readonly unit: string;
  readonly magnitude: number | null;
};

export type TraitsOf = (seriesId: string) => SeriesTraits;

export type AxisChoice = {
  readonly axis: number;
  readonly isNew: boolean;
};

type AxisKey = {
  readonly axis: number;
  readonly unit: string;
};

export const seriesTraitsOf = (series: Series | undefined, statistics: SeriesStatistics | null): SeriesTraits => ({
  unit: series?.unit ?? '',
  magnitude: statistics === null ? null : Math.max(Math.abs(statistics.minimum), Math.abs(statistics.maximum)),
});

export const axesOf = (chart: PlottedChart): readonly number[] => R.unique(R.map(chart.plotted, (entry) => entry.axis));

export const seriesOnAxis = (chart: PlottedChart, axis: number): readonly PlottedSeries[] => R.filter(chart.plotted, (entry) => entry.axis === axis);

const nextAxisOf = (chart: PlottedChart): number => Math.max(FIRST_AXIS - 1, ...axesOf(chart)) + 1;

const scaleOf = (traits: SeriesTraits): number | null => {
  const measured = traits.magnitude !== null && traits.magnitude > 0 ? traits.magnitude : null;

  return isPercentUnit(traits.unit) ? Math.max(PERCENT_SCALE, measured ?? 0) : measured;
};

const isSpreadReadable = (scales: readonly (number | null)[]): boolean => {
  const known = R.filter(scales, R.isNonNullish);

  return known.length < 2 || Math.max(...known) <= Math.min(...known) * SHARED_AXIS_SPREAD;
};

const canJoinAxis = (chart: PlottedChart, axis: number, joining: SeriesTraits, traitsOf: TraitsOf): boolean => {
  const residents = R.map(seriesOnAxis(chart, axis), (entry) => traitsOf(entry.seriesId));

  return residents.every((resident) => resident.unit === joining.unit) && isSpreadReadable(R.map([...residents, joining], scaleOf));
};

export const axisFor = (chart: PlottedChart, seriesId: string, traitsOf: TraitsOf): number =>
  axesOf(chart).find((axis) => canJoinAxis(chart, axis, traitsOf(seriesId), traitsOf)) ?? nextAxisOf(chart);

const axisKeyOf = (entry: PlottedSeries, unitOf: UnitOf): AxisKey => ({ axis: entry.axis, unit: unitOf(entry.seriesId) });

export const normalizedChart = (chart: PlottedChart, unitOf: UnitOf): PlottedChart => {
  const keys = R.uniqueWith(
    R.map(chart.plotted, (entry) => axisKeyOf(entry, unitOf)),
    R.isDeepEqual,
  );

  return {
    ...chart,
    plotted: R.map(chart.plotted, (entry) => {
      const key = axisKeyOf(entry, unitOf);

      return { ...entry, axis: keys.findIndex((candidate) => R.isDeepEqual(candidate, key)) };
    }),
  };
};

export const mergedChart = (target: PlottedChart, merging: PlottedChart, traitsOf: TraitsOf): PlottedChart =>
  normalizedChart(
    R.reduce(
      merging.plotted,
      (chart, entry) => ({ ...chart, plotted: [...chart.plotted, { seriesId: entry.seriesId, axis: axisFor(chart, entry.seriesId, traitsOf) }] }),
      target,
    ),
    (seriesId) => traitsOf(seriesId).unit,
  );

export const axisChoicesOf = (chart: PlottedChart, seriesId: string, unitOf: UnitOf): readonly AxisChoice[] => {
  const unit = unitOf(seriesId);
  const current = chart.plotted.find((entry) => entry.seriesId === seriesId);
  const isAlone = current !== undefined && seriesOnAxis(chart, current.axis).length === 1;

  const sharedAxes = R.pipe(
    axesOf(chart),
    R.filter((axis) => seriesOnAxis(chart, axis).every((entry) => unitOf(entry.seriesId) === unit)),
    R.map((axis) => ({ axis, isNew: false })),
  );

  return isAlone ? sharedAxes : [...sharedAxes, { axis: nextAxisOf(chart), isNew: true }];
};

export const withSeriesOnAxis = (chart: PlottedChart, seriesId: string, axis: number, unitOf: UnitOf): PlottedChart =>
  normalizedChart({ ...chart, plotted: R.map(chart.plotted, (entry) => (entry.seriesId === seriesId ? { ...entry, axis } : entry)) }, unitOf);
