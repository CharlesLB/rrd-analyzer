import { describe, expect, it } from 'vitest';
import { calendarCells, calendarMonthOf, monthTitleOf, shiftMonth } from './calendar-grid';

const AUGUST = new Date(2026, 7, 1).getTime();
const BOUNDS = { fromMilliseconds: new Date(2026, 6, 30, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

describe('calendarCells', () => {
  const cells = calendarCells(AUGUST, '2026-08-22 15:00', '2026-08-29 15:00', BOUNDS);
  const cellFor = (month: number, day: number) => cells.find((cell) => cell.dayStartMilliseconds === new Date(2026, month, day).getTime());

  it('lays out six weeks starting on the Sunday before the first of the month', () => {
    expect(cells).toHaveLength(42);
    expect(cells[0].label).toBe('26');
    expect(cells[0].isInMonth).toBe(false);
    expect(cells[6].label).toBe('1');
  });

  it('marks both ends of the range and every day between them', () => {
    expect(cellFor(7, 22)?.isRangeEnd).toBe(true);
    expect(cellFor(7, 29)?.isRangeEnd).toBe(true);
    expect(cellFor(7, 25)?.isInRange).toBe(true);
    expect(cellFor(7, 22)?.isInRange).toBe(false);
  });

  it('marks the days outside the data as out of bounds, the edges included as in bounds', () => {
    expect(cellFor(6, 29)?.isOutOfBounds).toBe(true);
    expect(cellFor(6, 30)?.isOutOfBounds).toBe(false);
    expect(cellFor(7, 29)?.isOutOfBounds).toBe(false);
    expect(cellFor(7, 30)?.isOutOfBounds).toBe(true);
  });

  it('shows no range when either end cannot be read', () => {
    expect(calendarCells(AUGUST, 'nope', '2026-08-29 15:00', BOUNDS).some((cell) => cell.isInRange)).toBe(false);
  });
});

describe('calendarMonthOf', () => {
  it('prefers the month navigated to, then the From field, then the window start', () => {
    expect(calendarMonthOf(123, '2026-08-22 15:00', 0)).toBe(123);
    expect(calendarMonthOf(null, '2026-08-22 15:00', 0)).toBe(AUGUST);
    expect(calendarMonthOf(null, '', new Date(2026, 6, 12).getTime())).toBe(new Date(2026, 6, 1).getTime());
  });
});

describe('month navigation', () => {
  it('steps a month either way and titles it in full', () => {
    expect(monthTitleOf(shiftMonth(AUGUST, 1), MONTH_NAMES)).toBe('September 2026');
    expect(monthTitleOf(shiftMonth(AUGUST, -8), MONTH_NAMES)).toBe('December 2025');
  });
});
