import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { CloseIconComponent } from './close-icon.component';

describe('CloseIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a cross, hidden from a reader since the button around it carries the name', () => {
    const fixture = TestBed.createComponent(CloseIconComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'path')?.getAttribute('d')).toBe('M0.5 0.5l9 9M9.5 0.5l-9 9');
    expect(elementOf(fixture, '.close-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
