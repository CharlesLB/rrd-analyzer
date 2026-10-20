import { describe, expect, it } from 'vitest';
import { placeColorMenu } from './color-menu';

describe('placeColorMenu', () => {
  it('hangs the palette under the swatch pressed, from its left edge, for the series it recolors', () => {
    expect(placeColorMenu({ seriesId: 's3', left: 260, bottom: 120 }, { width: 1440, height: 900 })).toEqual({
      seriesId: 's3',
      top: 126,
      bottom: null,
      right: 932,
    });
  });

  it('keeps the palette inside the window for a swatch near its right edge', () => {
    expect(placeColorMenu({ seriesId: 's3', left: 1400, bottom: 120 }, { width: 1440, height: 900 }).right).toBe(10);
  });
});
