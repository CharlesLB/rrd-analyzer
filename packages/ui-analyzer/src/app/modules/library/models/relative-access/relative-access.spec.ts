import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE, messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { formatRelativeAccess } from './relative-access';

const texts = messagesFor();
const now = new Date(2026, 7, 29, 15, 0).getTime();
const ago = (milliseconds: number): string => formatRelativeAccess(now - milliseconds, now, texts);

describe('formatRelativeAccess', () => {
  it('calls the last minute opened just now', () => {
    expect(ago(0)).toBe('opened just now');
    expect(ago(59_000)).toBe('opened just now');
  });

  it('counts minutes and then hours', () => {
    expect(ago(12 * MILLISECONDS_PER_MINUTE)).toBe('opened 12 min ago');
    expect(ago(2 * MILLISECONDS_PER_HOUR)).toBe('opened 2 h ago');
  });

  it('calls the day before yesterday', () => {
    expect(ago(30 * MILLISECONDS_PER_HOUR)).toBe('opened yesterday');
  });

  it('calls yesterday only the calendar day before, so the morning of two days ago is two days ago', () => {
    const wednesdayMorning = new Date(2026, 7, 26, 9, 0).getTime();
    const mondayMorning = new Date(2026, 7, 24, 10, 0).getTime();
    const tuesdayEarly = new Date(2026, 7, 25, 0, 30).getTime();

    expect(formatRelativeAccess(mondayMorning, wednesdayMorning, texts)).toBe('opened 2 d ago');
    expect(formatRelativeAccess(tuesdayEarly, wednesdayMorning, texts)).toBe('opened yesterday');
  });

  it('counts whole days further back', () => {
    expect(ago(72 * MILLISECONDS_PER_HOUR)).toBe('opened 3 d ago');
    expect(ago(7 * 24 * MILLISECONDS_PER_HOUR)).toBe('opened 7 d ago');
  });

  it('never reads as being in the future', () => {
    expect(formatRelativeAccess(now + MILLISECONDS_PER_DAY, now, texts)).toBe('opened just now');
  });
});
