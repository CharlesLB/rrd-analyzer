import type { UnitMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { formatShortTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import { scaledY, type ValueRange, type VerticalBand, valueAtFraction } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { coordinateOf, evenlySpacedPositionOf, gappedPolylineOf } from '../../../../shared/utils/svg-path/svg-path.util';
import { formatValue } from '../../../../shared/utils/value-format/value-format.util';
import { fractionAt } from '../../../../stores/time-window/models/range-fraction/range-fraction';
import type { SeriesSample } from '../../../../stores/workspace/models/series/series.model';
import { TIME_AXIS_DIVISIONS, timeTickInstantsOf } from '../../../../stores/workspace/models/time-axis/time-axis';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';
import type { ValueAxis } from '../../../../stores/workspace/models/value-axis/value-axis';

export const PLOT_WIDTH = 1000;
export const PLOT_HEIGHT = 100;
export const PLOT_VIEW_BOX = `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`;

const PLOT_TOP = 4;
const PLOT_DRAWABLE_HEIGHT = 92;
const HORIZONTAL_DIVISIONS = 3;
const PERCENT_SIGN = '%';

export type PlotLine = {
  readonly seriesId: string;
  readonly color: string;
  readonly path: string;
};

type AxisValueLabel = {
  readonly text: string;
  readonly color: string | null;
};

export type AxisLabelRow = {
  readonly topPercent: string;
  readonly values: readonly AxisValueLabel[];
};

export const TICK_ALIGNMENTS = {
  START: 'start',
  MIDDLE: 'middle',
  END: 'end',
} as const;

type TickAlignment = ValueOf<typeof TICK_ALIGNMENTS>;

type TimeTick = {
  readonly left: string;
  readonly label: string;
  readonly alignment: TickAlignment;
};

const PLOT_BAND: VerticalBand = { top: PLOT_TOP, height: PLOT_DRAWABLE_HEIGHT };

export const lastPresentOf = (samples: readonly SeriesSample[]): number | null => R.findLast(samples, R.isNonNullish) ?? null;

export const plotYOf = (value: number, range: ValueRange): number => scaledY(value, range, PLOT_BAND);

export const plotTopPercentOf = (value: number, range: ValueRange): string => `${plotYOf(value, range)}${PERCENT_SIGN}`;

export const plotPathOf = (samples: readonly SeriesSample[], range: ValueRange): string =>
  gappedPolylineOf(samples, (value, index) => ({ x: evenlySpacedPositionOf(index, samples.length, PLOT_WIDTH), y: plotYOf(value, range) }));

const horizontalPositions = R.map(R.range(0, HORIZONTAL_DIVISIONS + 1), (index) => PLOT_TOP + (PLOT_DRAWABLE_HEIGHT * index) / HORIZONTAL_DIVISIONS);

export const HORIZONTAL_GRID_LINES: readonly string[] = R.map(horizontalPositions, (position) => coordinateOf(position));

export const VERTICAL_GRID_LINES: readonly string[] = R.map(R.range(1, TIME_AXIS_DIVISIONS), (index) =>
  coordinateOf((PLOT_WIDTH * index) / TIME_AXIS_DIVISIONS),
);

const tickAlignmentOf = (index: number): TickAlignment => {
  if (index === 0) {
    return TICK_ALIGNMENTS.START;
  }

  return index === TIME_AXIS_DIVISIONS ? TICK_ALIGNMENTS.END : TICK_ALIGNMENTS.MIDDLE;
};

export const timeTicksOf = (visibleWindow: TimeRange): readonly TimeTick[] =>
  R.map(timeTickInstantsOf(visibleWindow), (instant, index) => ({
    left: percentOf(index / TIME_AXIS_DIVISIONS),
    label: formatShortTimestamp(instant),
    alignment: tickAlignmentOf(index),
  }));

const gridValueLabelOf = (range: ValueRange, unit: string, units: UnitMessages, index: number): string =>
  formatValue(valueAtFraction(range, 1 - index / HORIZONTAL_DIVISIONS), unit, units);

export const sampleAtFraction = (samples: readonly SeriesSample[], fraction: number): SeriesSample =>
  samples[Math.round(fraction * (samples.length - 1))] ?? null;

export const columnFractionOf = (fraction: number, sampleCount: number): number => {
  const lastColumn = sampleCount - 1;

  return lastColumn < 1 ? fraction : Math.round(fraction * lastColumn) / lastColumn;
};

export const plotXOf = (instantMilliseconds: number, visibleWindow: TimeRange): number => fractionAt(visibleWindow, instantMilliseconds) * PLOT_WIDTH;

export const axisLabelRowsOf = (axes: readonly ValueAxis[], units: UnitMessages): readonly AxisLabelRow[] => {
  const isColored = axes.length > 1;

  return R.map(horizontalPositions, (position, index) => ({
    topPercent: `${position}${PERCENT_SIGN}`,
    values: R.map(axes, (axis) => ({ text: gridValueLabelOf(axis.range, axis.unit, units, index), color: isColored ? axis.color : null })),
  }));
};
