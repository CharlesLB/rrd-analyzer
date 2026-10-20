import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { DayShift } from '../../../../stores/workspace/models/day-shift/day-shift';
import { SHIFT_DIRECTIONS } from '../../../../stores/workspace/models/timeframe/timeframe';
import { TimeNavComponent } from './time-nav.component';

const WINDOW = { fromMilliseconds: 1_000, untilMilliseconds: 2_000 };

const BACK_SHIFT: DayShift = {
  direction: SHIFT_DIRECTIONS.BACKWARD,
  window: WINDOW,
  isAvailable: true,
  title: 'Back 1 day',
  detail: '28/08 15:00  →  29/08 15:00',
};

const FORWARD_SHIFT: DayShift = {
  direction: SHIFT_DIRECTIONS.FORWARD,
  window: WINDOW,
  isAvailable: false,
  title: 'End of data',
  detail: 'Files end 29/08 15:00',
};

const renderNav = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(TimeNavComponent, {
    backShift: BACK_SHIFT,
    forwardShift: FORWARD_SHIFT,
    timeframeLabel: 'Last 24 hours',
    durationAndStep: '24 h · step 6 min',
    isTimeframeOpen: false,
    isCompact: false,
    ...overrides,
  });

describe('TimeNavComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('puts the window label between the two arrows', () => {
    const fixture = renderNav();

    expect(textOf(fixture, '.time-nav-dates-label')).toBe('Last 24 hours');
    expect(elementsOf(fixture, '.time-nav-arrow').length).toBe(2);
    expect(elementsOf(fixture, '.time-nav-arrow-backward, .time-nav-dates, .time-nav-arrow-forward').length).toBe(3);
  });

  it('passes on the direction the arrow it holds asked for', () => {
    const fixture = renderNav();
    const requested = vi.fn();

    fixture.componentInstance.shiftRequested.subscribe(requested);
    elementOf(fixture, '.time-nav-arrow-backward .time-nav-arrow-button')?.click();

    expect(requested).toHaveBeenCalledWith(SHIFT_DIRECTIONS.BACKWARD);
  });

  it('reports where the dates button ends, so the popover can hang under it', () => {
    const fixture = renderNav();
    const toggled = vi.fn();

    fixture.componentInstance.datesToggled.subscribe(toggled);
    elementOf(fixture, '.time-nav-dates')?.click();

    expect(toggled).toHaveBeenCalledWith(expect.any(Number));
  });

  it('tells the duration and the step of the window on the dates button, or what it does while there is no window', () => {
    expect(elementOf(renderNav(), '.time-nav-dates')?.title).toBe('24 h · step 6 min');
    expect(elementOf(renderNav({ durationAndStep: '' }), '.time-nav-dates')?.title).toBe('pick dates');
  });

  it('marks the dates button while its popover is open, and shortens the label on a compact window', () => {
    expect(elementOf(renderNav({ isTimeframeOpen: true }), '.time-nav-dates-open')).not.toBeNull();
    expect(elementOf(renderNav(), '.time-nav-dates-label-compact')).toBeNull();
    expect(elementOf(renderNav({ isCompact: true }), '.time-nav-dates-label-compact')).not.toBeNull();
  });
});
