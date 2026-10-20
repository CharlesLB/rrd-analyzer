import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, elementOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { BrandComponent } from './brand.component';

describe('BrandComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the application icon beside the product name, the icon left to decoration', () => {
    const fixture = renderWithInputs(BrandComponent, {});

    expect(textOf(fixture, '.brand-name')).toBe('RRD Analyzer');
    expect(attributeOf(fixture, '.brand-icon', 'src')).toBe('app-icon.svg');
    expect(attributeOf(fixture, '.brand-icon', 'alt')).toBe('');
  });

  it('draws a smaller mark when it is asked to be compact', () => {
    const fixture = renderWithInputs(BrandComponent, { isCompact: true });

    expect(elementOf(fixture, '.brand')?.classList.contains('brand-compact')).toBe(true);
  });
});
