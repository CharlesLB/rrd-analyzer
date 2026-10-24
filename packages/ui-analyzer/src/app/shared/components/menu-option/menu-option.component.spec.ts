import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { MenuOptionComponent } from './menu-option.component';

const OPTION = { tag: 'PNG', heading: 'PNG image', detail: '1920 × 1080' };

describe('MenuOptionComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows its tag, its heading and the detail under it, on one button', () => {
    const fixture = renderWithInputs(MenuOptionComponent, OPTION);

    expect(textOf(fixture, '.menu-option-tag')).toBe('PNG');
    expect(textOf(fixture, '.menu-option-heading')).toBe('PNG image');
    expect(textOf(fixture, '.menu-option-detail')).toBe('1920 × 1080');
    expect(elementOf(fixture, 'button.menu-option')?.getAttribute('type')).toBe('button');
  });

  it('reports that it was chosen when its button is clicked', () => {
    const fixture = renderWithInputs(MenuOptionComponent, OPTION);
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);

    elementOf(fixture, '.menu-option')?.click();

    expect(chosen).toHaveBeenCalledTimes(1);
  });
});
