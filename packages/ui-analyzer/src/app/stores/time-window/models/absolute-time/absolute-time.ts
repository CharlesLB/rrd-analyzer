import type { ValueOf } from '../../../../shared/types/value-of';
import { formatCalendarDate, formatClockTime, formatFullTimestamp } from '../../../../shared/utils/date-format/date-format.util';

const ABSOLUTE_TIMESTAMP_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/;
const MONTH_NUMBER_OFFSET = 1;
const START_OF_DAY_CLOCK = '00:00';
const END_OF_DAY_CLOCK = '23:59';

export const ABSOLUTE_FIELDS = {
  FROM: 'from',
  TO: 'to',
} as const;

export type AbsoluteField = ValueOf<typeof ABSOLUTE_FIELDS>;

export const parseAbsoluteTimestamp = (text: string): number | null => {
  const match = ABSOLUTE_TIMESTAMP_PATTERN.exec(text.trim());

  if (match === null) {
    return null;
  }

  const [year, monthNumber, day, hours, minutes] = match.slice(1).map(Number);
  const month = monthNumber - MONTH_NUMBER_OFFSET;
  const moment = new Date(year, month, day, hours, minutes);

  const isAsWritten =
    moment.getFullYear() === year && moment.getMonth() === month && moment.getDate() === day && moment.getHours() === hours && moment.getMinutes() === minutes;

  return isAsWritten ? moment.getTime() : null;
};

export const ABSOLUTE_PROBLEMS = {
  FROM_FORMAT: 'from-format',
  TO_FORMAT: 'to-format',
  TO_BEFORE_FROM: 'to-before-from',
} as const;

export type AbsoluteProblem = ValueOf<typeof ABSOLUTE_PROBLEMS>;

export const absoluteProblemOf = (fromText: string, toText: string): AbsoluteProblem | null => {
  const fromMilliseconds = parseAbsoluteTimestamp(fromText);
  const untilMilliseconds = parseAbsoluteTimestamp(toText);

  if (fromMilliseconds === null) {
    return ABSOLUTE_PROBLEMS.FROM_FORMAT;
  }

  if (untilMilliseconds === null) {
    return ABSOLUTE_PROBLEMS.TO_FORMAT;
  }

  return untilMilliseconds <= fromMilliseconds ? ABSOLUTE_PROBLEMS.TO_BEFORE_FROM : null;
};

export const ABSOLUTE_OUTCOMES = {
  APPLIED: 'applied',
  ADJUSTED: 'adjusted',
  REFUSED: 'refused',
} as const;

export type AbsoluteOutcome = ValueOf<typeof ABSOLUTE_OUTCOMES>;

export const timestampOnDay = (dayStartMilliseconds: number, currentText: string, field: AbsoluteField): string => {
  const current = parseAbsoluteTimestamp(currentText);
  const defaultClock = field === ABSOLUTE_FIELDS.FROM ? START_OF_DAY_CLOCK : END_OF_DAY_CLOCK;
  const clock = current === null ? defaultClock : formatClockTime(current);
  const timestamp = `${formatCalendarDate(dayStartMilliseconds)} ${clock}`;

  return parseAbsoluteTimestamp(timestamp) === null ? formatFullTimestamp(dayStartMilliseconds) : timestamp;
};
