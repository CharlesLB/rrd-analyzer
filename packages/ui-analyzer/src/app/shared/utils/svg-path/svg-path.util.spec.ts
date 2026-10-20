import { describe, expect, it } from 'vitest';
import { coordinateOf, evenlySpacedPositionOf, gappedPolylineOf, presentRunsOf } from './svg-path.util';

describe('gappedPolylineOf', () => {
  it('lifts the pen over a hole and puts it down again at the next reading', () => {
    const path = gappedPolylineOf([1, 2, null, 4], (value, index) => ({ x: index * 10, y: value }));

    expect(path).toBe('M0.0 1.0 L10.0 2.0 M30.0 4.0');
  });

  it('draws nothing when every reading is missing', () => {
    expect(gappedPolylineOf([null, null], (value, index) => ({ x: index, y: value }))).toBe('');
  });
});

describe('presentRunsOf', () => {
  it('presentRunsOf readings broken by holes lists each unbroken stretch by its first and last index', () => {
    expect(presentRunsOf([null, 1, 2, null, null, 5, 6, 7])).toEqual([
      { from: 1, until: 2 },
      { from: 5, until: 7 },
    ]);
  });

  it('presentRunsOf readings with no hole is one stretch over all of them, and none over nothing but holes', () => {
    expect(presentRunsOf([1, 2, 3])).toEqual([{ from: 0, until: 2 }]);
    expect(presentRunsOf([null, null])).toEqual([]);
  });
});

describe('evenlySpacedPositionOf', () => {
  it('spreads readings from the left edge to the right one, and keeps a lone reading at the left', () => {
    expect(evenlySpacedPositionOf(2, 5, 100)).toBe(50);
    expect(evenlySpacedPositionOf(4, 5, 100)).toBe(100);
    expect(evenlySpacedPositionOf(0, 1, 100)).toBe(0);
  });
});

describe('coordinateOf', () => {
  it('writes a coordinate to one decimal place', () => {
    expect(coordinateOf(12.34)).toBe('12.3');
  });
});
