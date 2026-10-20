import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { TrashIconComponent } from './trash-icon.component';

describe('TrashIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a bin, hidden from a reader since the button around it carries the name', () => {
    const fixture = TestBed.createComponent(TrashIconComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'path')?.getAttribute('d')).toContain('M2.5 4.5h11');
    expect(elementOf(fixture, '.trash-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
