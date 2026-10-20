import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf, renderWithInputs, textsOf, typeInto } from '../../utils/component-fixture/component-fixture.fixture';
import { SearchFieldComponent } from './search-field.component';

const HISTORY = ['memory', 'cpu user', 'cpu system'];
const FIELD_SELECTOR = '.search-field-input';

const renderField = (value = '', history: readonly string[] = HISTORY) => {
  const fixture = renderWithInputs(SearchFieldComponent, { value, placeholder: 'Filter charts…', history });
  const emitted = { committed: [] as string[], forgotten: [] as string[] };

  fixture.componentInstance.committed.subscribe((term) => emitted.committed.push(term));
  fixture.componentInstance.forgotten.subscribe((term) => emitted.forgotten.push(term));

  return { fixture, emitted };
};

const fieldOf = (fixture: ReturnType<typeof renderField>['fixture']): HTMLInputElement => {
  const field = elementOf(fixture, FIELD_SELECTOR);

  if (!(field instanceof HTMLInputElement)) {
    throw new Error('the search field has no input');
  }

  return field;
};

const press = (fixture: ReturnType<typeof renderField>['fixture'], key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

  fieldOf(fixture).dispatchEvent(event);
  fixture.detectChanges();

  return event;
};

const focus = (fixture: ReturnType<typeof renderField>['fixture']): void => {
  fieldOf(fixture).dispatchEvent(new Event('focus'));
  fixture.detectChanges();
};

describe('SearchFieldComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the clear button only while something is typed, and clearing empties the field', () => {
    const { fixture } = renderField();

    expect(elementOf(fixture, '.search-field-clear')).toBeNull();

    typeInto(fixture, FIELD_SELECTOR, 'cpu');
    fixture.detectChanges();
    elementOf(fixture, '.search-field-clear')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('');
    expect(elementOf(fixture, '.search-field-clear')).toBeNull();
  });

  it('names the clear button for a screen reader, not only by its glyph', () => {
    const { fixture } = renderField('cpu');

    expect(elementOf(fixture, '.search-field-clear')?.getAttribute('aria-label')).toBe('Clear search');
  });

  it('lists the recent searches on focus and narrows them to the ones holding what is typed', () => {
    const { fixture } = renderField();

    focus(fixture);

    expect(textsOf(fixture, '.search-field-history-term')).toEqual(HISTORY);

    typeInto(fixture, FIELD_SELECTOR, 'CPU');
    fixture.detectChanges();

    expect(textsOf(fixture, '.search-field-history-term')).toEqual(['cpu user', 'cpu system']);
    expect(fieldOf(fixture).getAttribute('aria-expanded')).toBe('true');
  });

  it('picks a recent search with the arrows and Enter, and keeps that Enter from reaching the page', () => {
    const { fixture, emitted } = renderField();

    focus(fixture);
    press(fixture, 'ArrowDown');
    press(fixture, 'ArrowDown');
    const enter = press(fixture, 'Enter');

    expect(fixture.componentInstance.value()).toBe('cpu user');
    expect(emitted.committed).toEqual(['cpu user']);
    expect(enter.defaultPrevented).toBe(true);
    expect(elementOf(fixture, '.search-field-history')).toBeNull();
  });

  it('commits the typed term on Enter and lets the Enter through when no recent search is highlighted', () => {
    const { fixture, emitted } = renderField('  disk ');

    const enter = press(fixture, 'Enter');

    expect(emitted.committed).toEqual(['disk']);
    expect(enter.defaultPrevented).toBe(false);
  });

  it('closes the list on Escape without letting the Escape through, and lets the next one through', () => {
    const { fixture } = renderField();

    focus(fixture);

    expect(press(fixture, 'Escape').defaultPrevented).toBe(true);
    expect(elementOf(fixture, '.search-field-history')).toBeNull();
    expect(press(fixture, 'Escape').defaultPrevented).toBe(false);
  });

  it('commits what was typed when the field is left, and nothing when it was left blank', () => {
    const { fixture, emitted } = renderField();

    fieldOf(fixture).dispatchEvent(new Event('blur'));
    typeInto(fixture, FIELD_SELECTOR, 'memory used');
    fieldOf(fixture).dispatchEvent(new Event('blur'));

    expect(emitted.committed).toEqual(['memory used']);
  });

  it('asks to forget a recent search without picking it', () => {
    const { fixture, emitted } = renderField();

    focus(fixture);
    elementOf(fixture, '.search-field-history-forget')?.click();

    expect(emitted.forgotten).toEqual(['memory']);
    expect(emitted.committed).toEqual([]);
    expect(fixture.componentInstance.value()).toBe('');
  });
});
