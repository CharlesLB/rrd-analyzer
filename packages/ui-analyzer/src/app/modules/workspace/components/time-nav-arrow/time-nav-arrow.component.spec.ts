import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { DayShift } from '../../../../stores/workspace/models/day-shift/day-shift';
import { SHIFT_DIRECTIONS } from '../../../../stores/workspace/models/timeframe/timeframe';
import { TimeNavArrowComponent } from './time-nav-arrow.component';

const AVAILABLE_BACK: DayShift = {
  direction: SHIFT_DIRECTIONS.BACKWARD,
  window: { fromMilliseconds: 1_000, untilMilliseconds: 2_000 },
  isAvailable: true,
  title: 'Back 1 day',
  detail: '28/08 15:00  →  29/08 15:00',
};

const EXHAUSTED_FORWARD: DayShift = {
  direction: SHIFT_DIRECTIONS.FORWARD,
  window: { fromMilliseconds: 1_000, untilMilliseconds: 2_000 },
  isAvailable: false,
  title: 'End of data',
  detail: 'Files end 29/08 15:00',
};

const renderArrow = (shift: DayShift) => renderWithInputs(TimeNavArrowComponent, { shift });

const hover = (fixture: ReturnType<typeof renderArrow>): void => {
  elementOf(fixture, '.time-nav-arrow')?.dispatchEvent(new MouseEvent('mouseenter'));
  fixture.detectChanges();
};

describe('TimeNavArrowComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the chevron of its own direction and names the shift for a reader that cannot see it', () => {
    expect(elementOf(renderArrow(AVAILABLE_BACK), '.time-nav-arrow-icon path')?.getAttribute('d')).toBe('M10 3.5 5.5 8l4.5 4.5');
    expect(elementOf(renderArrow(EXHAUSTED_FORWARD), '.time-nav-arrow-icon path')?.getAttribute('d')).toBe('M6 3.5 10.5 8 6 12.5');
    expect(elementOf(renderArrow(AVAILABLE_BACK), '.time-nav-arrow-button')?.getAttribute('aria-label')).toBe('back one day');
    expect(elementOf(renderArrow(EXHAUSTED_FORWARD), '.time-nav-arrow-button')?.getAttribute('aria-label')).toBe('forward one day');
  });

  it('asks for the shift its direction stands for', () => {
    const fixture = renderArrow(AVAILABLE_BACK);
    const requested = vi.fn();

    fixture.componentInstance.shiftRequested.subscribe(requested);
    elementOf(fixture, '.time-nav-arrow-button')?.click();

    expect(requested).toHaveBeenCalledWith(SHIFT_DIRECTIONS.BACKWARD);
  });

  it('disables the button at the edge of the data, and still explains why on hover', () => {
    const fixture = renderArrow(EXHAUSTED_FORWARD);

    expect(elementOf(fixture, '.time-nav-arrow-button')?.getAttribute('aria-disabled')).toBe('true');

    hover(fixture);

    expect(textOf(fixture, '.time-nav-arrow-tip-title')).toBe('End of data');
    expect(textOf(fixture, '.time-nav-arrow-tip-detail')).toBe('Files end 29/08 15:00');
  });

  it('shows the range the shift would land on, and forgets it when the pointer leaves', () => {
    const fixture = renderArrow(AVAILABLE_BACK);

    hover(fixture);

    expect(textOf(fixture, '.time-nav-arrow-tip-title')).toBe('Back 1 day');
    expect(textOf(fixture, '.time-nav-arrow-tip-detail')).toBe('28/08 15:00  →  29/08 15:00');

    elementOf(fixture, '.time-nav-arrow')?.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();

    expect(elementOf(fixture, '.time-nav-arrow-tip')).toBeNull();
  });

  it('shows its tooltip to the keyboard too, on focus, and an arrow with nowhere to go stays focusable, says so and shifts nothing', () => {
    const fixture = renderArrow(EXHAUSTED_FORWARD);
    const requested = vi.fn();
    fixture.componentInstance.shiftRequested.subscribe(requested);
    const button = elementOf(fixture, '.time-nav-arrow-button');

    button?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();

    expect(textOf(fixture, '.time-nav-arrow-tip-title')).toBe('End of data');
    expect(button?.getAttribute('aria-disabled')).toBe('true');

    button?.click();
    button?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    fixture.detectChanges();

    expect(requested).not.toHaveBeenCalled();
    expect(elementOf(fixture, '.time-nav-arrow-tip')).toBeNull();
  });
});
