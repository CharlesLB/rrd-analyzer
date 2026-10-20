import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, countOf, elementOf, elementsOf, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { FeaturesComponent } from './features.component';

describe('FeaturesComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('is the features section the header links to', () => {
    const fixture = TestBed.createComponent(FeaturesComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'section.features')?.id).toBe('features');
  });

  it('walks through the five features in order, every other one mirrored', () => {
    const fixture = TestBed.createComponent(FeaturesComponent);
    fixture.detectChanges();

    expect(textsOf(fixture, '.feature-row-ordinal')).toEqual(['01', '02', '03', '04', '05']);
    expect(elementsOf(fixture, '.feature-row').map((row) => row.classList.contains('feature-row-mirrored'))).toEqual([false, true, false, true, false]);
  });

  it('shows the insights shortcut as a key', () => {
    const fixture = TestBed.createComponent(FeaturesComponent);
    fixture.detectChanges();

    expect(textOf(fixture, 'kbd.features-key')).toBe('I');
  });

  it('lists the log types in their own colors', () => {
    const fixture = TestBed.createComponent(FeaturesComponent);
    fixture.detectChanges();

    expect(textsOf(fixture, '.features-log-type')).toEqual(['fatal', 'error', 'warn', 'info', 'debug']);
    expect(attributeOf(fixture, '.features-log-type-dot', 'style')).toContain('var(--logFatal)');
  });

  it('closes on the four highlights', () => {
    const fixture = TestBed.createComponent(FeaturesComponent);
    fixture.detectChanges();

    expect(countOf(fixture, '.features-highlight')).toBe(4);
    expect(textOf(fixture, '.features-highlight-title')).toBe('Local only');
  });
});
