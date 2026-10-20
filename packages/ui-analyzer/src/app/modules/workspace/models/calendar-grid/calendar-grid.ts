import * as R from 'remeda';
import { startOfDay, startOfMonth } from '../../../../shared/utils/date-format/date-format.util';
import { parseAbsoluteTimestamp } from '../../../../stores/time-window/models/absolute-time/absolute-time';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';

const CALENDAR_CELL_COUNT = 42;
const FIRST_DAY_OF_MONTH = 1;

export type CalendarCell = {
  readonly dayStartMilliseconds: number;
  readonly label: string;
  readonly isRangeEnd: boolean;
  readonly isInRange: boolean;
  readonly isOutOfBounds: boolean;
  readonly isInMonth: boolean;
};

const dayOf = (text: string): number | null => {
  const parsed = parseAbsoluteTimestamp(text);

  return parsed === null ? null : startOfDay(parsed);
};

export const calendarMonthOf = (chosenMonth: number | null, fromText: string, windowFromMilliseconds: number): number =>
  chosenMonth ?? startOfMonth(parseAbsoluteTimestamp(fromText) ?? windowFromMilliseconds);

export const shiftMonth = (monthStartMilliseconds: number, offset: number): number => {
  const moment = new Date(monthStartMilliseconds);

  return new Date(moment.getFullYear(), moment.getMonth() + offset, FIRST_DAY_OF_MONTH).getTime();
};

export const monthTitleOf = (monthStartMilliseconds: number, monthNames: readonly string[]): string => {
  const moment = new Date(monthStartMilliseconds);

  return `${monthNames[moment.getMonth()]} ${moment.getFullYear()}`;
};

export const calendarCells = (monthStartMilliseconds: number, fromText: string, toText: string, bounds: TimeRange): readonly CalendarCell[] => {
  const moment = new Date(monthStartMilliseconds);
  const year = moment.getFullYear();
  const month = moment.getMonth();
  const leadingDays = new Date(year, month, FIRST_DAY_OF_MONTH).getDay();
  const fromDay = dayOf(fromText);
  const toDay = dayOf(toText);
  const firstDataDay = startOfDay(bounds.fromMilliseconds);
  const lastDataDay = startOfDay(bounds.untilMilliseconds);

  return R.map(R.range(0, CALENDAR_CELL_COUNT), (index) => {
    const date = new Date(year, month, FIRST_DAY_OF_MONTH - leadingDays + index);
    const dayStart = date.getTime();

    return {
      dayStartMilliseconds: dayStart,
      label: `${date.getDate()}`,
      isRangeEnd: dayStart === fromDay || dayStart === toDay,
      isInRange: fromDay !== null && toDay !== null && dayStart > fromDay && dayStart < toDay,
      isOutOfBounds: dayStart < firstDataDay || dayStart > lastDataDay,
      isInMonth: date.getMonth() === month,
    };
  });
};
