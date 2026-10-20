import { describe, expect, it } from 'vitest';
import {
  type Canvas,
  canvasSeriesIdsOf,
  chartIdOf,
  chartIdsOf,
  chartOf,
  chartPlotting,
  chartWithId,
  isMergedChart,
  isOnCanvas,
  plotsSeries,
  seriesIdsOf,
} from './plotted-chart';
import { chartFixture } from './plotted-chart.fixture';

const MERGED = chartFixture({ seriesId: 's3', axis: 0 }, { seriesId: 's5', axis: 1 });

const CANVAS: Canvas = [MERGED, chartOf('s0')];

describe('chartOf', () => {
  it('chartOf a series draws that series alone, against the first axis', () => {
    expect(chartOf('s1')).toEqual({ plotted: [{ seriesId: 's1', axis: 0 }], referenceLines: [] });
  });
});

describe('chartIdOf', () => {
  it('chartIdOf a chart is its first series, so a merged chart keeps the identity of the chart it was dropped on', () => {
    expect(chartIdOf(MERGED)).toBe('s3');
    expect(chartIdOf(chartOf('s0'))).toBe('s0');
  });
});

describe('series of a chart', () => {
  it('seriesIdsOf lists every series a chart draws in the order they were merged, and plotsSeries finds each', () => {
    expect(seriesIdsOf(MERGED)).toEqual(['s3', 's5']);
    expect(plotsSeries(MERGED, 's5')).toBe(true);
    expect(plotsSeries(MERGED, 's0')).toBe(false);
  });

  it('isMergedChart holds for a chart drawing more than one series', () => {
    expect(isMergedChart(MERGED)).toBe(true);
    expect(isMergedChart(chartOf('s0'))).toBe(false);
  });
});

describe('series of a canvas', () => {
  it('canvasSeriesIdsOf lists every series drawn, chart after chart, and chartIdsOf one identity per chart', () => {
    expect(canvasSeriesIdsOf(CANVAS)).toEqual(['s3', 's5', 's0']);
    expect(chartIdsOf(CANVAS)).toEqual(['s3', 's0']);
  });

  it('isOnCanvas counts a series merged into a chart as on the canvas', () => {
    expect(isOnCanvas(CANVAS, 's5')).toBe(true);
    expect(isOnCanvas(CANVAS, 's9')).toBe(false);
  });

  it('chartWithId finds a chart by its identity only, and chartPlotting by any series it draws', () => {
    expect(chartWithId(CANVAS, 's3')).toBe(MERGED);
    expect(chartWithId(CANVAS, 's5')).toBeUndefined();
    expect(chartPlotting(CANVAS, 's5')).toBe(MERGED);
  });
});
