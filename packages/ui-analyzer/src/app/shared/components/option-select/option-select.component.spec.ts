import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { OPTION_MENU_SIZES } from '../option-menu/option-menu.component';
import { OptionSelectComponent } from './option-select.component';

const ITEMS = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
];

const renderSelect = (size: string = OPTION_MENU_SIZES.REGULAR) => renderWithInputs(OptionSelectComponent, { items: ITEMS, selected: 'hours', size });

describe('OptionSelectComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the label of the selected option with its menu closed', () => {
    const fixture = renderSelect();

    expect(textOf(fixture, '.option-select-trigger')).toContain('hours');
    expect(elementOf(fixture, 'app-option-menu')).toBeNull();
  });

  it('opens on its trigger, reports the option chosen and closes', () => {
    const fixture = renderSelect();
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);

    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();

    expect(elementOf(fixture, '.option-select-trigger-open')).not.toBeNull();

    elementsOf(fixture, '.option-menu-item')[2]?.click();
    fixture.detectChanges();

    expect(chosen).toHaveBeenCalledWith('days');
    expect(elementOf(fixture, 'app-option-menu')).toBeNull();
  });

  it('says through its trigger that it opens a listbox, and whether that listbox is open', () => {
    const fixture = renderSelect();
    const trigger = elementOf(fixture, '.option-select-trigger');

    expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(elementOf(fixture, 'app-option-menu')).not.toBeNull();
  });

  it('closes on Escape without choosing, hands the focus back to its trigger and keeps the key from the layer it sits in', async () => {
    const fixture = renderSelect();
    document.body.appendChild(fixture.nativeElement);
    const chosen = vi.fn();
    const heardByTheLayer = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);
    document.addEventListener('keydown', heardByTheLayer);
    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-option-menu')).toBeNull();
    expect(chosen).not.toHaveBeenCalled();
    expect(heardByTheLayer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(elementOf(fixture, '.option-select-trigger'));

    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(heardByTheLayer).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', heardByTheLayer);
  });

  it('hands the focus back to its trigger once an option is chosen', () => {
    const fixture = renderSelect();
    document.body.appendChild(fixture.nativeElement);
    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();

    elementsOf(fixture, '.option-menu-item')[0]?.click();

    expect(document.activeElement).toBe(elementOf(fixture, '.option-select-trigger'));
  });

  it('closes without choosing when a press lands outside it', () => {
    const fixture = renderSelect();
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);

    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-option-menu')).toBeNull();
    expect(chosen).not.toHaveBeenCalled();
  });

  it('draws the compact trigger and menu on request', () => {
    const fixture = renderSelect(OPTION_MENU_SIZES.COMPACT);

    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();

    expect(elementOf(fixture, '.option-select-trigger-compact')).not.toBeNull();
    expect(elementOf(fixture, '.option-menu-compact')).not.toBeNull();
  });
});
