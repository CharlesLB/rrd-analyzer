import { describe, expect, it } from 'vitest';
import { isWrittenDate, parseLogTimestamp } from './log-timestamp';

const INSTANT = Date.parse('2026-08-29T10:24:00.000Z');

describe('parseLogTimestamp', () => {
  it('parseLogTimestamp, for an ISO string, reads the instant', () => {
    expect(parseLogTimestamp('2026-08-29T10:24:00.000Z')).toBe(INSTANT);
  });

  it('parseLogTimestamp, for an epoch in seconds, milliseconds or microseconds, reads the same instant', () => {
    expect(parseLogTimestamp(INSTANT / 1000)).toBe(INSTANT);
    expect(parseLogTimestamp(INSTANT)).toBe(INSTANT);
    expect(parseLogTimestamp(INSTANT * 1000)).toBe(INSTANT);
  });

  it('parseLogTimestamp, for an epoch in nanoseconds, as zap and Loki write it, reads the same instant', () => {
    expect(parseLogTimestamp(INSTANT * 1_000_000)).toBe(INSTANT);
  });

  it('parseLogTimestamp, for a time whose fraction follows a comma, as Python writes it, reads the fraction', () => {
    expect(parseLogTimestamp('2026-08-29 10:24:00,250')).toBe(Date.parse('2026-08-29 10:24:00.250'));
  });

  it('parseLogTimestamp, for an epoch written as text, reads it as the number', () => {
    expect(parseLogTimestamp(`${INSTANT}`)).toBe(INSTANT);
  });

  it('parseLogTimestamp, for a small number, a word or nothing, finds no time', () => {
    expect(parseLogTimestamp(503)).toBeNull();
    expect(parseLogTimestamp('error')).toBeNull();
    expect(parseLogTimestamp('12 retries')).toBeNull();
    expect(parseLogTimestamp(null)).toBeNull();
    expect(parseLogTimestamp({})).toBeNull();
  });

  it('isWrittenDate, for a date written out, says yes, and for an epoch, as a number or as text, says no', () => {
    expect(isWrittenDate('2026-08-29T10:24:00.000Z')).toBe(true);
    expect(isWrittenDate(INSTANT)).toBe(false);
    expect(isWrittenDate(`${INSTANT}`)).toBe(false);
    expect(isWrittenDate('error')).toBe(false);
  });
});
