import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogFieldRowComponent } from './log-field-row.component';

const OPTIONS = [
  { path: '@timestamp', sample: '"2026-08-29T10:24:00.000Z"' },
  { path: 'lvl', sample: '"error"' },
];

const renderRow = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(LogFieldRowComponent, {
    label: 'Type',
    hint: 'level or category',
    path: 'lvl',
    isDetected: true,
    isOpen: false,
    validation: { state: 'ok', note: '5 types: fatal, error, warn, info, debug' },
    options: OPTIONS,
    ...inputs,
  });

describe('LogFieldRowComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the role, the field mapped to it, that it was detected, and an example checked off', () => {
    const fixture = renderRow();

    expect(textOf(fixture, '.log-field-row-label')).toBe('Type');
    expect(textOf(fixture, '.log-field-row-path')).toBe('lvl');
    expect(textOf(fixture, '.log-field-row-detected')).toBe('detected');
    expect(textOf(fixture, '.log-field-row-note')).toBe('✓5 types: fatal, error, warn, info, debug');
    expect(elementOf(fixture, '.log-field-row-options')).toBeNull();
  });

  it('with no field mapped, invites a choice and shows no detected badge', () => {
    const fixture = renderRow({ path: '', isDetected: false, validation: { state: 'error', note: 'Required — pick the level or category field.' } });

    expect(textOf(fixture, '.log-field-row-path')).toBe('Choose a field');
    expect(elementOf(fixture, '.log-field-row-detected')).toBeNull();
    expect(elementOf(fixture, '.log-field-row-trigger-blocked')).toBeNull();
    expect(elementOf(fixture, '.log-field-row-note-blocked')).not.toBeNull();
  });

  it('for a mapped field that blocks, outlines the field and flags the note, and for one that warns, only tints the note', () => {
    const blocked = renderRow({ validation: { state: 'error', note: 'Already used for Timestamp.' } });
    const warned = renderRow({ validation: { state: 'warning', note: '3 entries have no type — shown as “unknown”.' } });

    expect(elementOf(blocked, '.log-field-row-trigger-blocked')).not.toBeNull();
    expect(textOf(blocked, '.log-field-row-note-glyph')).toBe('!');
    expect(elementOf(warned, '.log-field-row-note-warned')).not.toBeNull();
    expect(elementOf(warned, '.log-field-row-trigger-blocked')).toBeNull();
  });

  it('when open, lists every field with a sample value, checks the mapped one and reports the one picked', () => {
    const fixture = renderRow({ isOpen: true });
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);

    expect(textsOf(fixture, '.log-field-row-option-path')).toEqual(['@timestamp', 'lvl']);
    expect(textsOf(fixture, '.log-field-row-option-sample')).toEqual(['"2026-08-29T10:24:00.000Z"', '"error"']);
    expect(elementsOf(fixture, '.log-field-row-option').map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true']);

    elementOf(fixture, '.log-field-row-option')?.click();

    expect(chosen).toHaveBeenCalledWith('@timestamp');
  });

  it('asks to open or close its list when the field is pressed', () => {
    const fixture = renderRow();
    const toggled = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);

    elementOf(fixture, '.log-field-row-trigger')?.click();

    expect(toggled).toHaveBeenCalledTimes(1);
    expect(elementOf(fixture, '.log-field-row-trigger')?.getAttribute('aria-expanded')).toBe('false');
  });
});
