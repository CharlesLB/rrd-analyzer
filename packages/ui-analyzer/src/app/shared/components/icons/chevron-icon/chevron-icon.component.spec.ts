import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf, renderWithInputs } from '../../../utils/component-fixture/component-fixture.fixture';
import { CHEVRON_DIRECTIONS, ChevronIconComponent } from './chevron-icon.component';

describe('ChevronIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the chevron pointing the way it is asked to', () => {
    expect(elementOf(renderWithInputs(ChevronIconComponent, { pointsTo: CHEVRON_DIRECTIONS.LEFT }), 'path')?.getAttribute('d')).toBe('M10 3.5 5.5 8l4.5 4.5');
    expect(elementOf(renderWithInputs(ChevronIconComponent, { pointsTo: CHEVRON_DIRECTIONS.RIGHT }), 'path')?.getAttribute('d')).toBe('M6 3.5 10.5 8 6 12.5');
  });

  it('stays hidden from a reader, since the button around it carries the name', () => {
    expect(elementOf(renderWithInputs(ChevronIconComponent, { pointsTo: CHEVRON_DIRECTIONS.LEFT }), '.chevron-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
