import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { CalendarIconComponent } from './calendar-icon.component';

describe('CalendarIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a page with its two rings, hidden from a reader since the button around it carries the name', () => {
    const fixture = TestBed.createComponent(CalendarIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, 'rect')).toBe(1);
    expect(countOf(fixture, 'path')).toBe(1);
    expect(elementOf(fixture, '.calendar-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
