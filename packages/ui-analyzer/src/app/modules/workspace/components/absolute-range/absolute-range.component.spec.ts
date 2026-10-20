import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { AbsoluteRangeComponent } from './absolute-range.component';

const BOUNDS = { fromMilliseconds: new Date(2026, 6, 30, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };
const WINDOW = { fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: BOUNDS.untilMilliseconds };

const renderRange = () =>
  renderWithInputs(AbsoluteRangeComponent, {
    draft: { fromText: '2026-08-28 15:00', toText: '2026-08-29 15:00', focusedField: 'from', calendarMonth: null },
    window: WINDOW,
    bounds: BOUNDS,
  });

const dayButton = (fixture: ReturnType<typeof renderRange>, label: string, occurrence = 0): HTMLElement | undefined =>
  elementsOf(fixture, '.month-calendar-day').filter((day) => day.textContent?.trim() === label)[occurrence];

describe('AbsoluteRangeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('opens on the month of From, with the data bounds and the From hint', () => {
    const fixture = renderRange();

    expect(textOf(fixture, '.month-calendar-title')).toBe('August 2026');
    expect(textOf(fixture, '.absolute-range-bounds')).toBe('Data: 2026-07-30 15:00 to 2026-08-29 15:00');
    expect(textOf(fixture, '.month-calendar-hint')).toBe('Picking a day fills the From field. Edit the time directly in the field.');
  });

  it('fills From with a picked day, keeps its time and hands focus to To', () => {
    const fixture = renderRange();

    dayButton(fixture, '22')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.draft().fromText).toBe('2026-08-22 15:00');
    expect(fixture.componentInstance.draft().focusedField).toBe('to');
    expect(elementOf(fixture, '.month-calendar-hint')?.textContent).toContain('the To field');

    dayButton(fixture, '24')?.click();

    expect(fixture.componentInstance.draft().toText).toBe('2026-08-24 15:00');
  });

  it('follows the field the reader focuses, and steps through months', () => {
    const fixture = renderRange();
    const inputs = elementsOf(fixture, '.absolute-range-input');

    inputs[1]?.dispatchEvent(new Event('focus'));
    elementsOf(fixture, '.month-calendar-step')[1]?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.draft().focusedField).toBe('to');
    expect(textOf(fixture, '.month-calendar-title')).toBe('September 2026');
    expect(inputs[1]?.classList.contains('absolute-range-input-focused')).toBe(true);
  });

  it('reports the apply to the page', () => {
    const fixture = renderRange();
    const applied = vi.fn();
    fixture.componentInstance.applyRequested.subscribe(applied);

    elementOf(fixture, '.absolute-range-apply')?.click();

    expect(applied).toHaveBeenCalledTimes(1);
  });

  it('in either field, Enter applies the typed range and Escape asks to close the popover', () => {
    const fixture = renderRange();
    const applied = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.applyRequested.subscribe(applied);
    fixture.componentInstance.closeRequested.subscribe(closed);
    const [from, to] = elementsOf(fixture, '.absolute-range-input');

    from?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    to?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(applied).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('says at once that To must come after From, and names a malformed end only once Apply is tried, applying neither', () => {
    const fixture = renderRange();
    const applied = vi.fn();
    fixture.componentInstance.applyRequested.subscribe(applied);

    typeInto(fixture, '.absolute-range-input', '2026-08-30 15:00');
    fixture.detectChanges();

    expect(textOf(fixture, '.absolute-range-problem')).toBe('"To" must be after "From"');
    expect(elementsOf(fixture, '.absolute-range-input').map((field) => field.getAttribute('aria-invalid'))).toEqual(['false', 'true']);

    typeInto(fixture, '.absolute-range-input', 'last tuesday');
    fixture.detectChanges();

    expect(elementOf(fixture, '.absolute-range-problem')).toBeNull();

    elementOf(fixture, '.absolute-range-apply')?.click();
    fixture.detectChanges();

    expect(textOf(fixture, '.absolute-range-problem')).toBe('use the format YYYY-MM-DD HH:MM');
    expect(elementOf(fixture, '.absolute-range-input-invalid')).toBe(elementsOf(fixture, '.absolute-range-input')[0]);
    expect(applied).not.toHaveBeenCalled();
  });

  it('shows the notice it is given while the fields still read as the window, and drops it once an end is edited', () => {
    const fixture = renderRange();
    fixture.componentRef.setInput('notice', 'adjusted to fit the data: now 2026-08-28 15:00 to 2026-08-29 15:00');
    fixture.detectChanges();

    expect(textOf(fixture, '.absolute-range-notice')).toBe('adjusted to fit the data: now 2026-08-28 15:00 to 2026-08-29 15:00');

    typeInto(fixture, '.absolute-range-input', '2026-08-27 15:00');
    fixture.detectChanges();

    expect(elementOf(fixture, '.absolute-range-notice')).toBeNull();
  });
});
