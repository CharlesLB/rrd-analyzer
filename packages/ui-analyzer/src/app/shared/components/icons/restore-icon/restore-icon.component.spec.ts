import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { RestoreIconComponent } from './restore-icon.component';

describe('RestoreIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a square in front of the corner of another, hidden from a reader since the button around it carries the name', () => {
    const fixture = TestBed.createComponent(RestoreIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, 'rect')).toBe(1);
    expect(countOf(fixture, 'path')).toBe(1);
    expect(elementOf(fixture, '.restore-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
