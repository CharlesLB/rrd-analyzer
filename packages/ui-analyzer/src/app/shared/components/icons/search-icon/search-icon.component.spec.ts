import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { SearchIconComponent } from './search-icon.component';

describe('SearchIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a magnifying glass, hidden from a reader since the button around it carries the name', () => {
    const fixture = TestBed.createComponent(SearchIconComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'circle')?.getAttribute('r')).toBe('4.5');
    expect(elementOf(fixture, '.search-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
