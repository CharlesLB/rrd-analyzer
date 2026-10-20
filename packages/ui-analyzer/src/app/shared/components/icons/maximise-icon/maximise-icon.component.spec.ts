import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { MaximiseIconComponent } from './maximise-icon.component';

describe('MaximiseIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws one square filling the glyph, hidden from a reader since the button around it carries the name', () => {
    const fixture = TestBed.createComponent(MaximiseIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, 'rect')).toBe(1);
    expect(countOf(fixture, 'path')).toBe(0);
    expect(elementOf(fixture, '.maximise-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
