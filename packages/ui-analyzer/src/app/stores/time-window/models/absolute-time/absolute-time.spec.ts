import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ABSOLUTE_FIELDS, absoluteProblemOf, parseAbsoluteTimestamp, timestampOnDay } from './absolute-time';

describe('parseAbsoluteTimestamp', () => {
  it('reads a local date and time written as YYYY-MM-DD HH:mm, with or without padding', () => {
    expect(parseAbsoluteTimestamp('2026-08-28 18:00')).toBe(new Date(2026, 7, 28, 18, 0).getTime());
    expect(parseAbsoluteTimestamp(' 2026-8-3T7:05 ')).toBe(new Date(2026, 7, 3, 7, 5).getTime());
  });

  it('refuses a date or time that does not exist instead of rolling it into the next month or day', () => {
    expect(parseAbsoluteTimestamp('2026-02-31 08:30')).toBeNull();
    expect(parseAbsoluteTimestamp('2026-13-01 00:00')).toBeNull();
    expect(parseAbsoluteTimestamp('2026-08-20 24:10')).toBeNull();
    expect(parseAbsoluteTimestamp('2026-08-20 08:75')).toBeNull();
    expect(parseAbsoluteTimestamp('2028-02-29 12:00')).toBe(new Date(2028, 1, 29, 12, 0).getTime());
  });

  it('refuses anything else', () => {
    expect(parseAbsoluteTimestamp('2026-08-28')).toBeNull();
    expect(parseAbsoluteTimestamp('yesterday 18:00')).toBeNull();
    expect(parseAbsoluteTimestamp('')).toBeNull();
  });
});

describe('timestampOnDay', () => {
  const day = new Date(2026, 7, 21).getTime();

  it('moves a field to the picked day and keeps the time it already had', () => {
    expect(timestampOnDay(day, '2026-08-28 15:30', ABSOLUTE_FIELDS.FROM)).toBe('2026-08-21 15:30');
  });

  it('starts an unreadable From at midnight and ends an unreadable To a minute before the next day', () => {
    expect(timestampOnDay(day, 'garbage', ABSOLUTE_FIELDS.FROM)).toBe('2026-08-21 00:00');
    expect(timestampOnDay(day, '', ABSOLUTE_FIELDS.TO)).toBe('2026-08-21 23:59');
  });
});

describe('timestampOnDay where the clocks skip midnight', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'America/Santiago');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts an unreadable From at the first minute the day has, one in the morning on the day summer time begins', () => {
    const summerTimeDay = new Date(2026, 8, 6).getTime();

    expect(timestampOnDay(summerTimeDay, '', ABSOLUTE_FIELDS.FROM)).toBe('2026-09-06 01:00');
  });

  it('moves a time the picked day skips to the first minute it has', () => {
    const summerTimeDay = new Date(2026, 8, 6).getTime();

    expect(timestampOnDay(summerTimeDay, '2026-09-01 00:30', ABSOLUTE_FIELDS.TO)).toBe('2026-09-06 01:00');
  });

  it('keeps midnight on a day that has one', () => {
    expect(timestampOnDay(new Date(2026, 8, 7).getTime(), '', ABSOLUTE_FIELDS.FROM)).toBe('2026-09-07 00:00');
  });
});

describe('absoluteProblemOf', () => {
  it('names the end that does not read, From first, then a To that is not after From, and nothing for a range that reads', () => {
    expect(absoluteProblemOf('last tuesday', 'tomorrow')).toBe('from-format');
    expect(absoluteProblemOf('2026-08-20 08:30', 'tomorrow')).toBe('to-format');
    expect(absoluteProblemOf('2026-08-20 08:30', '2026-08-20 08:30')).toBe('to-before-from');
    expect(absoluteProblemOf('2026-08-20 08:30', '2026-08-20 08:31')).toBeNull();
  });
});
