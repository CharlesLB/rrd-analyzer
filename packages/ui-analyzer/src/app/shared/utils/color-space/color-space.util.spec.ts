import { describe, expect, it } from 'vitest';
import { hexColorOf, hexOf, hsvOf, isHexColor, pureHueOf } from './color-space.util';

describe('color space', () => {
  it('reads a color as its hue, saturation and value, and writes it back the same', () => {
    expect(hsvOf('#ff0000')).toEqual({ hue: 0, saturation: 1, value: 1 });
    expect(hsvOf('#000000')).toEqual({ hue: 0, saturation: 0, value: 0 });
    expect(hsvOf('#ffffff')).toEqual({ hue: 0, saturation: 0, value: 1 });
    expect(['#c8402f', '#1d80ac', '#5e9e3a', '#7a5fb0', '#84898e', '#e5b800'].map((hex) => hexOf(hsvOf(hex)))).toEqual([
      '#c8402f',
      '#1d80ac',
      '#5e9e3a',
      '#7a5fb0',
      '#84898e',
      '#e5b800',
    ]);
  });

  it('paints the pure color of a hue, the one the hue track shows under it', () => {
    expect([0, 120, 240, 60].map(pureHueOf)).toEqual(['#ff0000', '#00ff00', '#0000ff', '#ffff00']);
  });

  it('accepts a typed color with or without its #, in any case, and refuses anything else', () => {
    expect(hexColorOf(' C8402F ')).toBe('#c8402f');
    expect(hexColorOf('#1D80AC')).toBe('#1d80ac');
    expect(hexColorOf('#1d80a')).toBeNull();
    expect(hexColorOf('blue')).toBeNull();
    expect(isHexColor('#1d80ac')).toBe(true);
    expect(isHexColor('1d80ac')).toBe(false);
  });
});
