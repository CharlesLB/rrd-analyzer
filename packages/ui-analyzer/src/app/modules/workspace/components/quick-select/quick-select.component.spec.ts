import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf, textsOf, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { QuickSelectComponent } from './quick-select.component';

const renderQuickSelect = () => renderWithInputs(QuickSelectComponent, { count: '24', unit: 'hours', activePresetKey: 'last24Hours' });

describe('QuickSelectComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('offers the nine common windows and marks the one showing', () => {
    const fixture = renderQuickSelect();
    expect(textsOf(fixture, '.quick-select-preset')).toEqual([
      'Last 15 minutes',
      'Last 30 minutes',
      'Last 1 hour',
      'Last 6 hours',
      'Last 12 hours',
      'Last 24 hours',
      'Last 7 days',
      'Last 30 days',
      'Last 3 months',
    ]);
    expect(textOf(fixture, '.quick-select-preset-active')).toBe('Last 24 hours');
  });

  it('opens the unit menu, and choosing a unit closes it', () => {
    const fixture = renderQuickSelect();

    expect(textOf(fixture, '.option-select-trigger')).toContain('hours');

    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-option-menu')).not.toBeNull();

    elementsOf(fixture, '.option-menu-item')[2]?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.unit()).toBe('days');
    expect(elementOf(fixture, 'app-option-menu')).toBeNull();
  });

  it('QuickSelectComponent, given a choice from the unit menu that is not a unit, keeps the unit it had', () => {
    const fixture = renderQuickSelect();

    fixture.debugElement.query(By.css('app-option-select')).triggerEventHandler('chosen', 'fortnights');

    expect(fixture.componentInstance.unit()).toBe('hours');
  });

  it('reports the typed count, the apply and a preset choice', () => {
    const fixture = renderQuickSelect();
    const applied = vi.fn();
    const chosen = vi.fn();
    fixture.componentInstance.applyRequested.subscribe(applied);
    fixture.componentInstance.presetChosen.subscribe(chosen);

    typeInto(fixture, '.quick-select-count', '6');
    elementOf(fixture, '.quick-select-apply')?.click();
    elementsOf(fixture, '.quick-select-preset')[0]?.click();

    expect(fixture.componentInstance.count()).toBe('6');
    expect(applied).toHaveBeenCalledTimes(1);
    expect(chosen).toHaveBeenCalledWith(900_000);
  });

  it('in the count field, Enter applies what is typed and Escape asks to close the popover', () => {
    const fixture = renderQuickSelect();
    const applied = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.applyRequested.subscribe(applied);
    fixture.componentInstance.closeRequested.subscribe(closed);
    const field = elementOf(fixture, '.quick-select-count');

    field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(applied).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('marks a count that is not a whole number of one or more as invalid, says what to type, and applies nothing', () => {
    const fixture = renderQuickSelect();
    const applied = vi.fn();
    fixture.componentInstance.applyRequested.subscribe(applied);

    expect(elementOf(fixture, '.quick-select-problem')).toBeNull();

    typeInto(fixture, '.quick-select-count', '2.9');
    fixture.detectChanges();
    elementOf(fixture, '.quick-select-apply')?.click();
    elementOf(fixture, '.quick-select-count')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(textOf(fixture, '.quick-select-problem')).toBe('type a whole number, 1 or more');
    expect(elementOf(fixture, '.quick-select-count')?.getAttribute('aria-invalid')).toBe('true');
    expect(applied).not.toHaveBeenCalled();
  });
});
