import * as R from 'remeda';
import { sampleExtentOf, type ValueRange } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { isPercentUnit } from '../../../../shared/utils/value-format/value-format.util';
import type { SampledLine, SeriesSample } from '../series/series.model';

const HEADROOM = 1.08;
const PERCENT_MAXIMUM = 100;
const FALLBACK_MAXIMUM = 1;

export type ValueAxis = {
  readonly axis: number;
  readonly unit: string;
  readonly color: string;
  readonly range: ValueRange;
};

export type RangedLine = SampledLine & {
  readonly range: ValueRange;
};

export const plotRangeOf = (samples: readonly SeriesSample[], unit: string): ValueRange => {
  const extent = sampleExtentOf(samples);
  const lowest = Math.min(0, extent?.lowest ?? 0);
  const highest = Math.max(0, extent?.highest ?? 0);
  const widenedLowest = Number.isFinite(lowest) ? lowest * HEADROOM : 0;

  if (isPercentUnit(unit)) {
    return { lowest: widenedLowest, highest: highest > PERCENT_MAXIMUM ? highest * HEADROOM : PERCENT_MAXIMUM };
  }

  const usable = Number.isFinite(highest) && highest > 0 ? highest : FALLBACK_MAXIMUM;

  return { lowest: widenedLowest, highest: widenedLowest < 0 && highest === 0 ? 0 : usable * HEADROOM };
};

const valueAxisOf = (axis: number, lines: readonly SampledLine[]): ValueAxis | null => {
  const members = R.filter(lines, (line) => line.axis === axis);
  const first = R.first(members);

  if (first === undefined) {
    return null;
  }

  const { unit, color } = first.series;

  return {
    axis,
    unit,
    color,
    range: plotRangeOf(
      R.flatMap(members, (member) => member.samples),
      unit,
    ),
  };
};

export const valueAxesOf = (lines: readonly SampledLine[]): readonly ValueAxis[] =>
  R.pipe(
    lines,
    R.map((line) => line.axis),
    R.unique(),
    R.map((axis) => valueAxisOf(axis, lines)),
    R.filter(R.isNonNullish),
  );

export const rangedLinesOf = <TLine extends SampledLine>(lines: readonly TLine[], axes: readonly ValueAxis[]): readonly (TLine & { range: ValueRange })[] =>
  R.map(lines, (line) => ({ ...line, range: axes.find((axis) => axis.axis === line.axis)?.range ?? plotRangeOf(line.samples, line.series.unit) }));
