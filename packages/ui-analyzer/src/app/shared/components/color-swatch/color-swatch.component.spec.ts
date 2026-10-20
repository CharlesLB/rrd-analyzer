import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../constants/colors';
import { cssColorOf, elementOf, renderWithInputs } from '../../utils/component-fixture/component-fixture.fixture';
import { ColorSwatchComponent } from './color-swatch.component';

describe('ColorSwatchComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('paints a medium swatch in the colour it is given, unless another size is asked for', () => {
    const medium = elementOf(renderWithInputs(ColorSwatchComponent, { color: SERIES_COLORS[3] }), '.color-swatch');
    const large = elementOf(renderWithInputs(ColorSwatchComponent, { color: SERIES_COLORS[3], size: 'large' }), '.color-swatch');
    const small = elementOf(renderWithInputs(ColorSwatchComponent, { color: SERIES_COLORS[3], size: 'small' }), '.color-swatch');

    expect(medium?.style.background).toBe(cssColorOf(SERIES_COLORS[3]));
    expect(medium?.classList.contains('color-swatch-large')).toBe(false);
    expect(large?.classList.contains('color-swatch-large')).toBe(true);
    expect(small?.classList.contains('color-swatch-small')).toBe(true);
  });
});
