import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, countOf, elementOf, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { DonateSectionComponent } from './donate-section.component';

describe('DonateSectionComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('is the donate section the header links to', () => {
    const fixture = TestBed.createComponent(DonateSectionComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'section.donate-section')?.id).toBe('donate');
  });

  it('draws the four bars of the icon, decoration a screen reader skips', () => {
    const fixture = TestBed.createComponent(DonateSectionComponent);
    fixture.detectChanges();

    expect(countOf(fixture, '.donate-section-bar')).toBe(4);
    expect(attributeOf(fixture, '.donate-section-bars', 'aria-hidden')).toBe('true');
  });

  it('sends a donation to Ko-fi in a new tab, the one way offered', () => {
    const fixture = TestBed.createComponent(DonateSectionComponent);
    fixture.detectChanges();

    expect(countOf(fixture, '.donate-section-provider')).toBe(1);
    expect(textOf(fixture, '.donate-section-provider-name')).toBe('Ko-fi');
    expect(attributeOf(fixture, '.donate-section-provider', 'href')).toBe('https://ko-fi.com/charleslb');
    expect(attributeOf(fixture, '.donate-section-provider', 'target')).toBe('_blank');
  });
});
