import { describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { thumbnailArtOf, thumbnailPathsOf } from './sparkline-path';

describe('thumbnailPathsOf', () => {
  it('traces the line across a hundred units with five percent of headroom, and closes the area to the baseline', () => {
    const paths = thumbnailPathsOf([0, 105, 52.5]);

    expect(paths.line).toBe('M0.0 28.0 L50.0 3.2 L100.0 15.6');
    expect(paths.area).toBe('M0.0 29 L0.0 28.0 L50.0 3.2 L100.0 15.6 L100.0 29 L0.0 29 Z');
  });

  it('breaks both the line and the area at a hole', () => {
    const paths = thumbnailPathsOf([10, 10, null, 10, 10]);

    expect(paths.line).toBe('M0.0 3.2 L25.0 3.2 M75.0 3.2 L100.0 3.2');
    expect(paths.area).toBe('M0.0 29 L0.0 3.2 L25.0 3.2 L25.0 29 L0.0 29 Z M75.0 29 L75.0 3.2 L100.0 3.2 L100.0 29 L75.0 29 Z');
  });

  it('thumbnailPathsOf readings below zero keeps the line inside the thumbnail', () => {
    const { line } = thumbnailPathsOf([-50, -30]);
    const heights = [...line.matchAll(/[ML][\d.]+ (-?[\d.]+)/g)].map((match) => Number(match[1]));

    expect(heights.every((height) => height >= 0 && height <= 30)).toBe(true);
  });

  it('draws nothing for a window without a reading', () => {
    expect(thumbnailPathsOf([null, null])).toEqual({ line: '', area: '' });
  });
});

describe('thumbnailArtOf', () => {
  it('tints the area with the series colour when area fill is on, and draws no area when it is off', () => {
    expect(thumbnailArtOf([1, 2], SERIES_COLORS[0], true).areaFill).toBe(`color-mix(in srgb,${SERIES_COLORS[0]} 14%,transparent)`);
    expect(thumbnailArtOf([1, 2], SERIES_COLORS[0], false)).toEqual({ line: thumbnailPathsOf([1, 2]).line, area: '', areaFill: 'none' });
  });
});
