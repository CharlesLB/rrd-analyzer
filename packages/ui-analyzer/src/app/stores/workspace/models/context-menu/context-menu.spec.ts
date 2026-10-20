import { describe, expect, it } from 'vitest';
import { canvasFixture, chartFixture } from '../plotted-chart/plotted-chart.fixture';
import { seriesFixture } from '../series/series.fixture';
import type { Series } from '../series/series.model';
import { mergeTargetsOf, placeContextMenu } from './context-menu';

const labelledSeries = (id: string, label: string): Series => seriesFixture(0, { id, label });

const SERIES_BY_ID: ReadonlyMap<string, Series> = new Map([
  ['a', labelledSeries('a', 'cpu')],
  ['b', labelledSeries('b', 'memory')],
  ['c', labelledSeries('c', 'disk')],
]);

const SEPARATOR = ' + ';

describe('placeContextMenu', () => {
  it('opens the menu at the pointer when it fits', () => {
    expect(placeContextMenu({ seriesId: 's1', clientX: 120, clientY: 300 }, { width: 924, height: 540 }, 0)).toEqual({ seriesId: 's1', x: 120, y: 300 });
  });

  it('keeps the menu on screen near the right and bottom edges', () => {
    expect(placeContextMenu({ seriesId: 's1', clientX: 900, clientY: 500 }, { width: 924, height: 540 }, 0)).toEqual({ seriesId: 's1', x: 698, y: 346 });
  });

  it('lifts the menu further for each chart it offers to merge with, plus the heading above them', () => {
    expect(placeContextMenu({ seriesId: 's1', clientX: 120, clientY: 500 }, { width: 924, height: 540 }, 3).y).toBe(228);
  });

  it('never lifts the menu past the top of a window too short to hold it', () => {
    expect(placeContextMenu({ seriesId: 's1', clientX: 120, clientY: 40 }, { width: 924, height: 200 }, 4).y).toBe(0);
  });
});

describe('mergeTargetsOf', () => {
  it('offers every chart on the canvas, labelled after the series it draws', () => {
    expect(mergeTargetsOf(canvasFixture('a', 'b'), 'z', SERIES_BY_ID, SEPARATOR)).toEqual([
      { chartId: 'a', label: 'cpu' },
      { chartId: 'b', label: 'memory' },
    ]);
  });

  it('labels a merged chart after every series in it, and leaves out the chart the series is already drawn in', () => {
    const canvas = [chartFixture({ seriesId: 'a', axis: 0 }, { seriesId: 'c', axis: 1 }), ...canvasFixture('b')];

    expect(mergeTargetsOf(canvas, 'c', SERIES_BY_ID, SEPARATOR)).toEqual([{ chartId: 'b', label: 'memory' }]);
    expect(mergeTargetsOf(canvas, 'z', SERIES_BY_ID, SEPARATOR)[0]).toEqual({ chartId: 'a', label: 'cpu + disk' });
  });

  it('offers nothing on an empty canvas', () => {
    expect(mergeTargetsOf([], 'a', SERIES_BY_ID, SEPARATOR)).toEqual([]);
  });
});
