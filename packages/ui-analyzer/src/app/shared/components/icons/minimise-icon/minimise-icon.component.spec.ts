import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { MinimiseIconComponent } from './minimise-icon.component';

describe('MinimiseIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a single dash, hidden from a reader since the button around it carries the name', () => {
    const fixture = TestBed.createComponent(MinimiseIconComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'path')?.getAttribute('d')).toBe('M0 5.5h10');
    expect(elementOf(fixture, '.minimise-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
