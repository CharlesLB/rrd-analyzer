import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { PlayIconComponent } from './play-icon.component';

describe('PlayIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a play triangle, hidden from a reader since the control around it carries the name', () => {
    const fixture = TestBed.createComponent(PlayIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, 'path')).toBe(1);
    expect(elementOf(fixture, '.play-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
