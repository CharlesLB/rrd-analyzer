import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf } from '../../utils/component-fixture/component-fixture.fixture';
import { BrandMarkComponent } from './brand-mark.component';

describe('BrandMarkComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the three bars of the mark, the tallest of them the peak', () => {
    const fixture = TestBed.createComponent(BrandMarkComponent);
    fixture.detectChanges();

    expect(countOf(fixture, '.brand-mark-column')).toBe(2);
    expect(countOf(fixture, '.brand-mark-peak')).toBe(1);
  });

  it('names the application so the mark reads as more than decoration', () => {
    const fixture = TestBed.createComponent(BrandMarkComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, '.brand-mark')?.getAttribute('aria-label')).toBe('RRD Analyzer');
  });
});
