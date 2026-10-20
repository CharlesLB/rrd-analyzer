import {
  HOURS_PER_DAY,
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
  type UnitMessages,
} from '@rrd-analyzer/shared';

const COMPACT_MINUTES_LIMIT = MINUTES_PER_HOUR + MINUTES_PER_HOUR / 2;
const COMPACT_HOURS_LIMIT = HOURS_PER_DAY * 2;
const SINGLE_DECIMAL_LIMIT = 10;

const padded = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

export const formatClockTime = (milliseconds: number): string => {
  const moment = new Date(milliseconds);

  return `${padded(moment.getHours())}:${padded(moment.getMinutes())}`;
};

export const formatCalendarDate = (milliseconds: number): string => {
  const moment = new Date(milliseconds);

  return `${moment.getFullYear()}-${padded(moment.getMonth() + 1)}-${padded(moment.getDate())}`;
};

export const formatShortTimestamp = (milliseconds: number): string => {
  const moment = new Date(milliseconds);

  return `${padded(moment.getDate())}/${padded(moment.getMonth() + 1)} ${formatClockTime(milliseconds)}`;
};

export const formatFullTimestamp = (milliseconds: number): string => `${formatCalendarDate(milliseconds)} ${formatClockTime(milliseconds)}`;

export const formatClockWithSeconds = (milliseconds: number): string => `${formatClockTime(milliseconds)}:${padded(new Date(milliseconds).getSeconds())}`;

export const formatTimestampWithSeconds = (milliseconds: number): string => `${formatCalendarDate(milliseconds)} ${formatClockWithSeconds(milliseconds)}`;

export const formatDuration = (milliseconds: number, units: UnitMessages): string => {
  const seconds = Math.round(milliseconds / MILLISECONDS_PER_SECOND);

  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds} ${units.seconds}`;
  }

  const minutes = Math.round(milliseconds / MILLISECONDS_PER_MINUTE);

  if (minutes < COMPACT_MINUTES_LIMIT) {
    return `${minutes} ${units.minutes}`;
  }

  const hours = milliseconds / MILLISECONDS_PER_HOUR;

  if (hours < COMPACT_HOURS_LIMIT) {
    return `${hours < SINGLE_DECIMAL_LIMIT ? hours.toFixed(1) : Math.round(hours)} ${units.hours}`;
  }

  const days = milliseconds / MILLISECONDS_PER_DAY;

  return `${days.toFixed(days < SINGLE_DECIMAL_LIMIT ? 1 : 0)} ${units.days}`;
};

export const startOfMonth = (milliseconds: number): number => {
  const moment = new Date(milliseconds);

  return new Date(moment.getFullYear(), moment.getMonth(), 1).getTime();
};

export const startOfDay = (milliseconds: number): number => {
  const moment = new Date(milliseconds);

  return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();
};
