import * as R from 'remeda';
import { colorOfType, type TypeColors } from '../../../../stores/logs/models/log-severity/log-severity';
import type { LogEntry } from '../../../../stores/logs/models/log-timeline/log-timeline';
import { fractionAt, holdsInstant } from '../../../../stores/time-window/models/range-fraction/range-fraction';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';
import { PLOT_WIDTH } from '../plot-geometry/plot-geometry';

export type LogMark = {
  readonly fraction: number;
  readonly x: number;
  readonly color: string;
  readonly isSelected: boolean;
};

type MarkedEntries = {
  readonly hovered: LogEntry | null;
  readonly selected: LogEntry | null;
};

export const NO_LOG_MARKS: readonly LogMark[] = [];

const markOf = (entry: LogEntry | null, isSelected: boolean, window: TimeRange, colors: TypeColors): LogMark | null => {
  if (entry === null || !holdsInstant(window, entry.timeMilliseconds)) {
    return null;
  }

  const fraction = fractionAt(window, entry.timeMilliseconds);

  return { fraction, x: fraction * PLOT_WIDTH, color: colorOfType(colors, entry.type), isSelected };
};

export const logMarksOf = ({ hovered, selected }: MarkedEntries, window: TimeRange, colors: TypeColors): readonly LogMark[] => {
  const marks = R.filter([markOf(hovered, false, window, colors), markOf(selected, true, window, colors)], R.isNonNullish);

  return marks.length === 0 ? NO_LOG_MARKS : marks;
};
