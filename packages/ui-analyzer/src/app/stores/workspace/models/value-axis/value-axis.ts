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

const valueAxisOf = (first: SampledLine, lines: readonly SampledLine[]): ValueAxis => {
  const { axis } = first;
  const { unit, color } = first.series;

  return {
    axis,
    unit,
    color,
    range: plotRangeOf(
      R.pipe(
        lines,
        R.filter((line) => line.axis === axis),
        R.flatMap((member) => member.samples),
      ),
      unit,
    ),
  };
};

export const valueAxesOf = (lines: readonly SampledLine[]): readonly ValueAxis[] =>
  R.map(
    R.uniqueBy(lines, (line) => line.axis),
    (first) => valueAxisOf(first, lines),
  );

export const rangedLinesOf = <TLine extends SampledLine>(lines: readonly TLine[], axes: readonly ValueAxis[]): readonly (TLine & { range: ValueRange })[] =>
  R.map(lines, (line) => ({ ...line, range: axes.find((axis) => axis.axis === line.axis)?.range ?? plotRangeOf(line.samples, line.series.unit) }));
