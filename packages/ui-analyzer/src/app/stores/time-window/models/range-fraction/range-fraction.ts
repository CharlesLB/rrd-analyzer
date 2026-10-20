import { spanOf, type TimeRange } from '../../../workspace/models/timeframe/timeframe';

export const fractionAt = (range: TimeRange, instantMilliseconds: number): number => (instantMilliseconds - range.fromMilliseconds) / spanOf(range);

export const holdsInstant = (range: TimeRange, instantMilliseconds: number): boolean =>
  instantMilliseconds >= range.fromMilliseconds && instantMilliseconds <= range.untilMilliseconds;
