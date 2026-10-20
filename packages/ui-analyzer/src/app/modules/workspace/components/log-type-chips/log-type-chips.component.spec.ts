import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_TYPE_COLORS } from '../../../../shared/constants/colors';
import { elementsOf, renderWithInputs, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogTypeChipsComponent, type TypeChip } from './log-type-chips.component';

const CHIPS: readonly TypeChip[] = [
  { name: 'error', count: '21', color: LOG_TYPE_COLORS.error, isHidden: false, tip: 'hide error' },
  { name: 'info', count: '1,402', color: LOG_TYPE_COLORS.info, isHidden: true, tip: 'show info' },
];

describe('LogTypeChipsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows one chip per type with its name, its count and its colour', () => {
    const fixture = renderWithInputs(LogTypeChipsComponent, { chips: CHIPS });
    const [error] = elementsOf(fixture, '.log-type-chips-chip');

    expect(textsOf(fixture, '.log-type-chips-chip-name')).toEqual(['error', 'info']);
    expect(textsOf(fixture, '.log-type-chips-chip-count')).toEqual(['21', '1,402']);
    expect(error?.style.getPropertyValue('--type-color')).toBe(LOG_TYPE_COLORS.error);
  });

  it('dims a hidden type, says what a press will do, and reports the type pressed', () => {
    const fixture = renderWithInputs(LogTypeChipsComponent, { chips: CHIPS });
    const toggled = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    const [error, info] = elementsOf(fixture, '.log-type-chips-chip');

    expect(error?.getAttribute('aria-pressed')).toBe('true');
    expect(info?.getAttribute('aria-pressed')).toBe('false');
    expect(info?.classList.contains('log-type-chips-chip-hidden')).toBe(true);
    expect(info?.title).toBe('show info');

    info?.click();

    expect(toggled).toHaveBeenCalledWith('info');
  });
});
