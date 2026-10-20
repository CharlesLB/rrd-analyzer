import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE, messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  formatClockTime,
  formatDuration,
  formatFullTimestamp,
  formatShortTimestamp,
  formatTimestampWithSeconds,
  startOfDay,
  startOfMonth,
} from './date-format.util';

const instant = new Date(2026, 7, 29, 15, 4).getTime();
const units = messagesFor().units;

describe('timestamp formatting', () => {
  it('renders the short axis form as day/month and clock time', () => {
    expect(formatShortTimestamp(instant)).toBe('29/08 15:04');
  });

  it('renders the full form the range inputs show', () => {
    expect(formatFullTimestamp(instant)).toBe('2026-08-29 15:04');
  });

  it('formatTimestampWithSeconds, for a log entry, adds the seconds to the full form', () => {
    expect(formatTimestampWithSeconds(new Date(2026, 7, 29, 7, 24, 5).getTime())).toBe('2026-08-29 07:24:05');
  });

  it('extracts the clock time the date picker starts from', () => {
    expect(formatClockTime(instant)).toBe('15:04');
  });

  it('renders the calendar date a day picked in the calendar keeps', () => {
    expect(formatCalendarDate(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('formatDuration', () => {
  it('counts seconds below a minute, so the step of a short window never reads 0 min', () => {
    expect(formatDuration(13_846, units)).toBe('14 s');
    expect(formatDuration(59_400, units)).toBe('59 s');
    expect(formatDuration(59_600, units)).toBe('1 min');
  });

  it('counts minutes below an hour and a half', () => {
    expect(formatDuration(6 * MILLISECONDS_PER_MINUTE, units)).toBe('6 min');
    expect(formatDuration(89 * MILLISECONDS_PER_MINUTE, units)).toBe('89 min');
  });

  it('switches to hours, with a decimal while under ten', () => {
    expect(formatDuration(90 * MILLISECONDS_PER_MINUTE, units)).toBe('1.5 h');
    expect(formatDuration(24 * MILLISECONDS_PER_HOUR, units)).toBe('24 h');
  });

  it('switches to days beyond two', () => {
    expect(formatDuration(7 * MILLISECONDS_PER_DAY, units)).toBe('7.0 d');
    expect(formatDuration(30 * MILLISECONDS_PER_DAY, units)).toBe('30 d');
  });
});

describe('calendar helpers', () => {
  it('finds the first instant of the day and of the month', () => {
    expect(formatFullTimestamp(startOfDay(instant))).toBe('2026-08-29 00:00');
    expect(formatFullTimestamp(startOfMonth(instant))).toBe('2026-08-01 00:00');
  });
});
