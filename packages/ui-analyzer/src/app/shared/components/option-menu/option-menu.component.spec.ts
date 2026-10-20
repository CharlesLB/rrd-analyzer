import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textsOf } from '../../utils/component-fixture/component-fixture.fixture';
import { OPTION_MENU_SIZES, OptionMenuComponent } from './option-menu.component';

const ITEMS = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
];

const renderMenu = (size: string = OPTION_MENU_SIZES.REGULAR) => renderWithInputs(OptionMenuComponent, { items: ITEMS, selected: 'hours', size });

const renderMenuOnThePage = async () => {
  const fixture = TestBed.createComponent(OptionMenuComponent);
  document.body.appendChild(fixture.nativeElement);
  fixture.componentRef.setInput('items', ITEMS);
  fixture.componentRef.setInput('selected', 'hours');
  fixture.detectChanges();
  await fixture.whenStable();

  return fixture;
};

describe('OptionMenuComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('lists every option and checks only the selected one', () => {
    const fixture = renderMenu();
    expect(textsOf(fixture, '.option-menu-check')).toEqual(['', '✓', '']);
    expect(elementOf(fixture, '.option-menu-item-selected')?.textContent).toContain('hours');
  });

  it('is a listbox whose options say which one is selected, and opens with the focus on that one', async () => {
    const fixture = await renderMenuOnThePage();

    expect(elementOf(fixture, '.option-menu')?.getAttribute('role')).toBe('listbox');
    expect(elementsOf(fixture, '[role="option"]').map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(document.activeElement).toBe(elementOf(fixture, '.option-menu-item-selected'));
  });

  it('moves the focus through its options with the arrows, Home and End, going round at the ends', async () => {
    const fixture = await renderMenuOnThePage();
    const options = elementsOf(fixture, '.option-menu-item');

    const press = (key: string): void => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };

    press('ArrowDown');

    expect(document.activeElement).toBe(options[2]);

    press('ArrowDown');

    expect(document.activeElement).toBe(options[0]);

    press('End');
    press('ArrowUp');

    expect(document.activeElement).toBe(options[1]);

    press('Home');

    expect(document.activeElement).toBe(options[0]);
  });

  it('reports the option chosen', () => {
    const fixture = renderMenu();
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);

    elementsOf(fixture, '.option-menu-item')[2]?.click();

    expect(chosen).toHaveBeenCalledWith('days');
  });

  it('draws the compact variant on request', () => {
    expect(elementOf(renderMenu(OPTION_MENU_SIZES.COMPACT), '.option-menu-compact')).not.toBeNull();
  });
});
