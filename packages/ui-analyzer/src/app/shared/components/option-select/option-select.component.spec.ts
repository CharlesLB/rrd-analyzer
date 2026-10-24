import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { OPTION_MENU_SIZES, type OptionMenuItem, type OptionMenuSize } from '../option-menu/option-menu.component';
import { OptionSelectComponent } from './option-select.component';

const ITEMS = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
];

@Component({
  selector: 'app-option-menu',
  template: `<button class="stub-option-menu-choice" type="button" (click)="chosen.emit('days')">days</button>`,
})
class StubOptionMenuComponent {
  public readonly items = input.required<readonly OptionMenuItem[]>();
  public readonly selected = input.required<string>();
  public readonly size = input.required<OptionMenuSize>();

  public readonly chosen = output<string>();
}

const renderSelect = (size: string = OPTION_MENU_SIZES.REGULAR, selected = 'hours') =>
  renderWithInputs(OptionSelectComponent, { items: ITEMS, selected, size });

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

  it('shows no label while the selected value is none of its options', () => {
    const fixture = renderSelect(OPTION_MENU_SIZES.REGULAR, 'weeks');

    expect(textOf(fixture, '.option-select-trigger span')).toBe('');
  });

  it('stays open on ArrowDown once open, leaving the key to the menu', () => {
    const fixture = renderSelect();
    const trigger = elementOf(fixture, '.option-select-trigger');
    trigger?.click();
    fixture.detectChanges();
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });

    trigger?.dispatchEvent(down);
    fixture.detectChanges();

    expect(down.defaultPrevented).toBe(false);
    expect(elementOf(fixture, 'app-option-menu')).not.toBeNull();
  });

  it('stays open when a press lands inside it', () => {
    const fixture = renderSelect();
    document.body.appendChild(fixture.nativeElement);
    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();

    elementsOf(fixture, '.option-menu-item')[0]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-option-menu')).not.toBeNull();
  });

  it('hands the menu it opens its options, the selected value and its size, and reports what that menu chose', () => {
    TestBed.overrideComponent(OptionSelectComponent, { set: { imports: [StubOptionMenuComponent] } });
    const fixture = renderSelect(OPTION_MENU_SIZES.COMPACT);
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);
    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();

    const menu: StubOptionMenuComponent = fixture.debugElement.query(By.directive(StubOptionMenuComponent)).componentInstance;
    elementOf(fixture, '.stub-option-menu-choice')?.click();

    expect([menu.items(), menu.selected(), menu.size()]).toEqual([ITEMS, 'hours', OPTION_MENU_SIZES.COMPACT]);
    expect(chosen).toHaveBeenCalledWith('days');
  });
});
