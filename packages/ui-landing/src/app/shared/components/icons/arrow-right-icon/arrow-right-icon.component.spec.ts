import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { ArrowRightIconComponent } from './arrow-right-icon.component';

describe('ArrowRightIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws an arrow pointing right, hidden from a reader since the control around it carries the name', () => {
    const fixture = TestBed.createComponent(ArrowRightIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, 'path')).toBe(2);
    expect(elementOf(fixture, '.arrow-right-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
