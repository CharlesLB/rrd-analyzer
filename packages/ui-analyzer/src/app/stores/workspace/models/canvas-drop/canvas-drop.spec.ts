import { describe, expect, it } from 'vitest';
import { DROP_POSITIONS } from '../canvas-operations/canvas-operations';
import type { SeriesTraits } from '../chart-axes/chart-axes';
import { canvasFixture, chartFixture } from '../plotted-chart/plotted-chart.fixture';
import { droppedInto, mergedIntoChart } from './canvas-drop';

const UNITS: Readonly<Record<string, string>> = { a: '%', b: 'B', c: '%' };

const traitsOf = (seriesId: string): SeriesTraits => ({ unit: UNITS[seriesId] ?? '', magnitude: null });

describe('droppedInto', () => {
  it('reports a placement with the series that was dropped as the active one', () => {
    expect(droppedInto(canvasFixture('a', 'b'), 'x', { chartId: 'b', position: DROP_POSITIONS.BEFORE }, traitsOf)).toEqual({
      kind: 'placed',
      canvas: canvasFixture('a', 'x', 'b'),
      activeSeriesId: 'x',
    });
  });

  it('reports the refusal the canvas gives back, leaving the canvas out of the result', () => {
    const canvas = [
      chartFixture({ seriesId: 'a', axis: 0 }, { seriesId: 'c', axis: 0 }, { seriesId: 'd', axis: 0 }, { seriesId: 'e', axis: 0 }, { seriesId: 'f', axis: 0 }),
      ...canvasFixture('b'),
    ];

    expect(droppedInto(canvas, 'b', { chartId: 'a', position: DROP_POSITIONS.MERGE }, traitsOf)).toEqual({
      kind: 'refused',
      refusal: 'chart-full',
    });
  });
});

describe('mergedIntoChart', () => {
  it('merges a series already on the canvas into another chart, naming what was merged into what', () => {
    expect(mergedIntoChart(canvasFixture('a', 'b'), 'b', 'a', traitsOf)).toEqual({
      kind: 'merged',
      canvas: [chartFixture({ seriesId: 'a', axis: 0 }, { seriesId: 'b', axis: 1 })],
      activeSeriesId: 'b',
      mergedSeriesIds: ['b'],
      targetChartId: 'a',
    });
  });

  it('merges a series that was not on the canvas at all, sharing an axis when the unit matches', () => {
    expect(mergedIntoChart(canvasFixture('a', 'b'), 'c', 'a', traitsOf)).toEqual({
      kind: 'merged',
      canvas: [chartFixture({ seriesId: 'a', axis: 0 }, { seriesId: 'c', axis: 0 }), ...canvasFixture('b')],
      activeSeriesId: 'c',
      mergedSeriesIds: ['c'],
      targetChartId: 'a',
    });
  });

  it('carries every series of a merged chart into its target', () => {
    const canvas = [chartFixture({ seriesId: 'a', axis: 0 }, { seriesId: 'c', axis: 0 }), ...canvasFixture('b')];

    expect(mergedIntoChart(canvas, 'c', 'b', traitsOf)).toEqual({
      kind: 'merged',
      canvas: [chartFixture({ seriesId: 'b', axis: 0 }, { seriesId: 'a', axis: 1 }, { seriesId: 'c', axis: 1 })],
      activeSeriesId: 'c',
      mergedSeriesIds: ['a', 'c'],
      targetChartId: 'b',
    });
  });

  it('refuses to draw more than five series in one chart', () => {
    const crowded = chartFixture({ seriesId: 'a', axis: 0 }, { seriesId: 'c', axis: 0 }, { seriesId: 'm', axis: 1 }, { seriesId: 'n', axis: 1 });
    const pair = chartFixture({ seriesId: 'x', axis: 0 }, { seriesId: 'y', axis: 1 });

    expect(mergedIntoChart([crowded, pair], 'x', 'a', traitsOf)).toEqual({ kind: 'refused', refusal: 'chart-full' });
  });
});
