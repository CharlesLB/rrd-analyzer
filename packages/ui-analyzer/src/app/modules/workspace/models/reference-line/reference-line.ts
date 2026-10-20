import type { StatisticsMessages, UnitMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import type { ValueRange } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { formatCompactValue } from '../../../../shared/utils/value-format/value-format.util';
import type { SeriesStatistics } from '../../../../stores/workspace/models/series/series.model';
import { STATISTIC_KEYS, type StatisticKey, statisticValueOf } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { PLOT_HEIGHT, plotYOf } from '../plot-geometry/plot-geometry';

const LOWEST_LABEL_TOP = 4;
const HIGHEST_LABEL_TOP = 96;
const LABEL_CLEARANCE = 11;
const WHOLE_PLOT = 100;

const DASH_OF: Readonly<Record<StatisticKey, string>> = {
  [STATISTIC_KEYS.MINIMUM]: '2 3',
  [STATISTIC_KEYS.AVERAGE]: '6 4',
  [STATISTIC_KEYS.MAXIMUM]: '2 3',
  [STATISTIC_KEYS.PERCENTILE95]: '8 3 2 3',
  [STATISTIC_KEYS.CURRENT]: '1 3',
};

type MeasuredLine = {
  readonly key: StatisticKey;
  readonly y: number;
  readonly dash: string;
  readonly label: string;
};

export type ReferenceLine = MeasuredLine & {
  readonly labelTop: string;
};

type PlacedLabel = {
  readonly line: MeasuredLine;
  readonly top: number;
};

const clampedToPlot = (y: number): number => Math.min(Math.max(y, 0), PLOT_HEIGHT);

const pushedBelowPrevious = (placed: readonly PlacedLabel[], candidate: PlacedLabel): readonly PlacedLabel[] => {
  const previous = R.last(placed);
  const top = previous === undefined ? candidate.top : Math.max(candidate.top, previous.top + LABEL_CLEARANCE);

  return [...placed, { ...candidate, top }];
};

const liftedIntoView = (placed: readonly PlacedLabel[]): readonly PlacedLabel[] => {
  const overflow = Math.max(0, (R.last(placed)?.top ?? 0) - HIGHEST_LABEL_TOP);

  return R.map(placed, (label) => ({ ...label, top: Math.max(LOWEST_LABEL_TOP, label.top - overflow) }));
};

const labelledInOrder = (lines: readonly MeasuredLine[]): readonly ReferenceLine[] =>
  R.pipe(
    lines,
    R.sortBy((line) => line.y),
    R.map((line) => ({ line, top: line.y })),
    R.reduce(pushedBelowPrevious, [] as readonly PlacedLabel[]),
    liftedIntoView,
    R.map((placed) => ({ ...placed.line, labelTop: percentOf(placed.top / WHOLE_PLOT) })),
  );

const measuredLineOf = (key: StatisticKey, statistics: SeriesStatistics, range: ValueRange, texts: StatisticsMessages, units: UnitMessages) => {
  const value = statisticValueOf(statistics, key);

  return Number.isFinite(value)
    ? { key, y: clampedToPlot(plotYOf(value, range)), dash: DASH_OF[key], label: `${texts[key]} ${formatCompactValue(value, units)}` }
    : null;
};

export const referenceLinesOf = (
  keys: readonly StatisticKey[],
  statistics: SeriesStatistics | null,
  range: ValueRange,
  texts: StatisticsMessages,
  units: UnitMessages,
): readonly ReferenceLine[] =>
  statistics === null
    ? []
    : R.pipe(
        keys,
        R.map((key) => measuredLineOf(key, statistics, range, texts, units)),
        R.filter(R.isNonNullish),
        labelledInOrder,
      );
