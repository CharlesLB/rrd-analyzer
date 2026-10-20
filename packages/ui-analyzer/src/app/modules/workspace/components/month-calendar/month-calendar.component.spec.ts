import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementsOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { CalendarCell } from '../../models/calendar-grid/calendar-grid';
import { MonthCalendarComponent } from './month-calendar.component';

const cell = (day: number, overrides: Partial<CalendarCell> = {}): CalendarCell => ({
  dayStartMilliseconds: day,
  label: `${day}`,
  isRangeEnd: false,
  isInRange: false,
  isOutOfBounds: false,
  isInMonth: true,
  ...overrides,
});

const renderCalendar = () =>
  renderWithInputs(MonthCalendarComponent, {
    title: 'August 2026',
    weekdays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    cells: [cell(1, { isRangeEnd: true }), cell(2, { isInRange: true }), cell(3, { isOutOfBounds: true }), cell(4, { isInMonth: false })],
    hint: 'Picking a day fills the From field. Edit the time directly in the field.',
  });

describe('MonthCalendarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('titles the month and marks range ends, days between, unavailable and other-month days', () => {
    const fixture = renderCalendar();
    const days = elementsOf(fixture, '.month-calendar-day');

    expect(textOf(fixture, '.month-calendar-title')).toBe('August 2026');
    expect(days[0]?.classList.contains('month-calendar-day-edge')).toBe(true);
    expect(days[1]?.classList.contains('month-calendar-day-between')).toBe(true);
    expect(days[2]?.classList.contains('month-calendar-day-unavailable')).toBe(true);
    expect(days[3]?.classList.contains('month-calendar-day-outside')).toBe(true);
  });

  it('picks a day inside the data and ignores one outside it', () => {
    const fixture = renderCalendar();
    const picked = vi.fn();
    fixture.componentInstance.dayPicked.subscribe(picked);
    const days = elementsOf(fixture, '.month-calendar-day');

    days[2]?.click();
    days[1]?.click();

    expect(picked).toHaveBeenCalledTimes(1);
    expect(picked).toHaveBeenCalledWith(2);
  });

  it('names each arrow and each day, so the month can be walked without seeing the glyphs', () => {
    const fixture = renderCalendar();
    const steps = elementsOf(fixture, '.month-calendar-step');
    const days = elementsOf(fixture, '.month-calendar-day');

    expect(steps.map((step) => step.getAttribute('aria-label'))).toEqual(['Previous month', 'Next month']);
    expect(days[0]?.getAttribute('aria-label')).toBe('1969-12-31');
    expect(days[2]?.getAttribute('aria-disabled')).toBe('true');
    expect(days[1]?.getAttribute('aria-disabled')).toBe('false');
  });

  it('asks for the previous and the next month', () => {
    const fixture = renderCalendar();
    const previous = vi.fn();
    const next = vi.fn();
    fixture.componentInstance.previousRequested.subscribe(previous);
    fixture.componentInstance.nextRequested.subscribe(next);
    const steps = elementsOf(fixture, '.month-calendar-step');

    steps[0]?.click();
    steps[1]?.click();

    expect(previous).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
