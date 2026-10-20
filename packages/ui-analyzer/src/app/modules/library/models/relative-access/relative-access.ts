import {
  formatMessage,
  HOURS_PER_DAY,
  type Messages,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MINUTES_PER_HOUR,
} from '@rrd-analyzer/shared';
import { startOfDay } from '../../../../shared/utils/date-format/date-format.util';

const ONE_DAY = 1;

const calendarDaysBetween = (earlierMilliseconds: number, laterMilliseconds: number): number =>
  Math.round((startOfDay(laterMilliseconds) - startOfDay(earlierMilliseconds)) / MILLISECONDS_PER_DAY);

export const formatRelativeAccess = (accessedMilliseconds: number, nowMilliseconds: number, texts: Messages): string => {
  const elapsed = Math.max(0, nowMilliseconds - accessedMilliseconds);
  const minutes = Math.floor(elapsed / MILLISECONDS_PER_MINUTE);

  if (minutes < 1) {
    return texts.relativeTime.justNow;
  }

  if (minutes < MINUTES_PER_HOUR) {
    return formatMessage(texts.relativeTime.minutesAgo, { count: minutes });
  }

  const hours = Math.floor(elapsed / MILLISECONDS_PER_HOUR);

  if (hours < HOURS_PER_DAY) {
    return formatMessage(texts.relativeTime.hoursAgo, { count: hours });
  }

  const days = calendarDaysBetween(accessedMilliseconds, nowMilliseconds);

  return days === ONE_DAY ? texts.relativeTime.yesterday : formatMessage(texts.relativeTime.daysAgo, { count: days });
};
