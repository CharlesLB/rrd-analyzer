import * as R from 'remeda';
import { instantAt, type TimeRange } from '../timeframe/timeframe';

export const TIME_AXIS_DIVISIONS = 8;

export const timeTickInstantsOf = (visibleWindow: TimeRange): readonly number[] =>
  R.map(R.range(0, TIME_AXIS_DIVISIONS + 1), (index) => instantAt(visibleWindow, index / TIME_AXIS_DIVISIONS));
