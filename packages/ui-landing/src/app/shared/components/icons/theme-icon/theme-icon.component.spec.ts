import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { ThemeIconComponent } from './theme-icon.component';

describe('ThemeIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a circle half filled, hidden from a reader since the control around it carries the name', () => {
    const fixture = TestBed.createComponent(ThemeIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, '.theme-icon-half')).toBe(1);
    expect(elementOf(fixture, '.theme-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
