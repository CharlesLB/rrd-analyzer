import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { ExternalLinkIconComponent } from './external-link-icon.component';

describe('ExternalLinkIconComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws an arrow leaving a box, hidden from a reader since the control around it carries the name', () => {
    const fixture = TestBed.createComponent(ExternalLinkIconComponent);
    fixture.detectChanges();

    expect(countOf(fixture, 'path')).toBe(3);
    expect(elementOf(fixture, '.external-link-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
