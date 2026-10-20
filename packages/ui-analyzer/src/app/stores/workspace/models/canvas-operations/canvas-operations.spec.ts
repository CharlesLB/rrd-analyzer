import { describe, expect, it } from 'vitest';
import type { SeriesTraits } from '../chart-axes/chart-axes';
import type { PlottedChart } from '../plotted-chart/plotted-chart';
import { canvasFixture, chartFixture } from '../plotted-chart/plotted-chart.fixture';
import {
  activeAfterRemoval,
  DRAG_ORIGINS,
  DROP_POSITIONS,
  type DraggedItem,
  dropPositionAt,
  droppedOnto,
  dropTargetFor,
  normalizedCanvas,
  openedFromLibrary,
  separatedChart,
  withChartAdded,
  withoutChart,
  withoutSeries,
  withSeriesMergedFirst,
  withSeriesPlotted,
} from './canvas-operations';

const UNITS: Readonly<Record<string, string>> = { a: '%', b: 'B', c: '%', m: 'ms', n: 'ms' };

const unitOf = (seriesId: string): string => UNITS[seriesId] ?? '';

const traitsOf = (seriesId: string): SeriesTraits => ({ unit: unitOf(seriesId), magnitude: null });

const fromLibrary = (seriesId: string): DraggedItem => ({ origin: DRAG_ORIGINS.LIBRARY, seriesId });

const fromCanvas = (chartId: string): DraggedItem => ({ origin: DRAG_ORIGINS.CANVAS, seriesId: chartId });

const canvasOf = canvasFixture;

const mergedChart = (...plotted: readonly (readonly [string, number])[]): PlottedChart =>
  chartFixture(...plotted.map(([seriesId, axis]) => ({ seriesId, axis })));

describe('dropPositionAt', () => {
  it('reads the top quarter as before, the bottom quarter as after and the middle as merge', () => {
    expect(dropPositionAt(0.1)).toBe('before');
    expect(dropPositionAt(0.25)).toBe('merge');
    expect(dropPositionAt(0.5)).toBe('merge');
    expect(dropPositionAt(0.75)).toBe('merge');
    expect(dropPositionAt(0.9)).toBe('after');
  });
});

describe('dropTargetFor', () => {
  it('dropTargetFor the chart being dragged offers no target anywhere on it, and one on any other chart', () => {
    const canvas = canvasOf('s1', 's2');

    expect(dropTargetFor(canvas, fromCanvas('s1'), 's1', 0.5)).toBeNull();
    expect(dropTargetFor(canvas, fromCanvas('s1'), 's1', 0.9)).toBeNull();
    expect(dropTargetFor(canvas, fromCanvas('s1'), 's1', 0.1)).toBeNull();
    expect(dropTargetFor(canvas, fromCanvas('s1'), 's2', 0.5)).toEqual({ chartId: 's2', position: 'merge' });
    expect(dropTargetFor(canvas, fromLibrary('s1'), 's2', 0.5)).toEqual({ chartId: 's2', position: 'merge' });
  });

  it('dropTargetFor a library series merged into a chart offers no target on the chart it is already drawn in', () => {
    const canvas = [mergedChart(['a', 0], ['c', 0]), ...canvasOf('b')];

    expect(dropTargetFor(canvas, fromLibrary('c'), 'a', 0.5)).toBeNull();
    expect(dropTargetFor(canvas, fromLibrary('c'), 'b', 0.5)).toEqual({ chartId: 'b', position: 'merge' });
  });
});

describe('droppedOnto', () => {
  it('droppedOnto its own place before or after itself leaves the canvas as it was', () => {
    expect(droppedOnto(canvasOf('a', 'b', 'c'), 'a', { chartId: 'a', position: DROP_POSITIONS.BEFORE }, traitsOf).canvas).toEqual(canvasOf('a', 'b', 'c'));
    expect(droppedOnto(canvasOf('a', 'b', 'c'), 'b', { chartId: 'b', position: DROP_POSITIONS.AFTER }, traitsOf).canvas).toEqual(canvasOf('a', 'b', 'c'));
  });

  it('moves a chart before or after another', () => {
    expect(droppedOnto(canvasOf('a', 'b', 'c'), 'c', { chartId: 'a', position: DROP_POSITIONS.BEFORE }, traitsOf).canvas).toEqual(canvasOf('c', 'a', 'b'));
    expect(droppedOnto(canvasOf('a', 'b', 'c'), 'a', { chartId: 'c', position: DROP_POSITIONS.AFTER }, traitsOf).canvas).toEqual(canvasOf('b', 'c', 'a'));
  });

  it('droppedOnto moves a merged chart whole, every series it draws travelling with it', () => {
    const merged = mergedChart(['a', 0], ['b', 1]);

    expect(droppedOnto([merged, ...canvasOf('x', 'y')], 'a', { chartId: 'y', position: DROP_POSITIONS.AFTER }, traitsOf).canvas).toEqual([
      ...canvasOf('x', 'y'),
      merged,
    ]);
  });

  it('inserts a library chart next to its target, however many charts the canvas already holds', () => {
    expect(droppedOnto(canvasOf('a', 'b'), 'x', { chartId: 'b', position: DROP_POSITIONS.BEFORE }, traitsOf).canvas).toEqual(canvasOf('a', 'x', 'b'));
    expect(droppedOnto(canvasOf('a', 'b', 'c', 'd', 'e'), 'x', { chartId: 'a', position: DROP_POSITIONS.AFTER }, traitsOf)).toEqual({
      canvas: canvasOf('a', 'x', 'b', 'c', 'd', 'e'),
      refusal: null,
    });
  });
});

describe('droppedOnto a merge', () => {
  it('merges the dragged chart into the one it was dropped on, which keeps its place while the dragged chart leaves the canvas', () => {
    expect(droppedOnto(canvasOf('a', 'b', 'c'), 'c', { chartId: 'a', position: DROP_POSITIONS.MERGE }, traitsOf)).toEqual({
      canvas: [mergedChart(['a', 0], ['c', 0]), ...canvasOf('b')],
      refusal: null,
    });
  });

  it('gives a merged series of another unit an axis of its own', () => {
    expect(droppedOnto(canvasOf('a', 'b'), 'b', { chartId: 'a', position: DROP_POSITIONS.MERGE }, traitsOf).canvas).toEqual([mergedChart(['a', 0], ['b', 1])]);
  });

  it('merges a chart into a chart that is already merged, three charts becoming one', () => {
    const canvas = [mergedChart(['a', 0], ['b', 1]), ...canvasOf('c')];

    expect(droppedOnto(canvas, 'c', { chartId: 'a', position: DROP_POSITIONS.MERGE }, traitsOf).canvas).toEqual([mergedChart(['a', 0], ['b', 1], ['c', 0])]);
  });

  it('refuses a merge that would draw more than five series in one chart, leaving the canvas as it was', () => {
    const canvas = [mergedChart(['a', 0], ['c', 0], ['m', 1], ['n', 1]), mergedChart(['b', 0], ['x', 1])];

    expect(droppedOnto(canvas, 'b', { chartId: 'a', position: DROP_POSITIONS.MERGE }, traitsOf)).toEqual({ canvas, refusal: 'chart-full' });
  });
});

describe('library operations', () => {
  it('openedFromLibrary adds the chart after the others, or alone on an empty canvas, and leaves one already there', () => {
    expect(openedFromLibrary(canvasOf('a', 'b'), 'x')).toEqual(canvasOf('a', 'b', 'x'));
    expect(openedFromLibrary([], 'x')).toEqual(canvasOf('x'));
    expect(openedFromLibrary(canvasOf('a', 'b'), 'a')).toEqual(canvasOf('a', 'b'));
  });

  it('openedFromLibrary leaves the canvas as it is for a series merged into one of its charts', () => {
    const canvas = [mergedChart(['a', 0], ['c', 0])];

    expect(openedFromLibrary(canvas, 'c')).toBe(canvas);
  });

  it('openedFromLibrary adds a sixth chart and more, the canvas having no limit', () => {
    expect(openedFromLibrary(canvasOf('a', 'b', 'c', 'm', 'n'), 'x')).toEqual(canvasOf('a', 'b', 'c', 'm', 'n', 'x'));
  });

  it('withSeriesPlotted adds each series the canvas lacks, once and in the order given, and keeps a merged one where it is', () => {
    const canvas = [mergedChart(['a', 0], ['c', 0])];

    expect(withSeriesPlotted(canvas, ['m', 'c', 'n', 'm'])).toEqual([...canvas, ...canvasOf('m', 'n')]);
    expect(withSeriesPlotted(canvas, ['a', 'c'])).toBe(canvas);
  });

  it('withSeriesPlotted plots every series asked for, past five charts', () => {
    expect(withSeriesPlotted(canvasOf('a', 'b', 'c'), ['m', 'n', 'x'])).toEqual(canvasOf('a', 'b', 'c', 'm', 'n', 'x'));
  });

  it('withChartAdded puts the series on a chart of its own after the others', () => {
    expect(withChartAdded(canvasOf('a'), 'b')).toEqual(canvasOf('a', 'b'));
  });

  it('removes a chart and hands the active mark to the first series left when it was active', () => {
    const remaining = withoutChart(canvasOf('a', 'b', 'c'), 'a');

    expect(remaining).toEqual(canvasOf('b', 'c'));
    expect(activeAfterRemoval(remaining, 'a')).toBe('b');
    expect(activeAfterRemoval(remaining, 'c')).toBe('c');
    expect(activeAfterRemoval([], 'a')).toBeNull();
  });

  it('withoutChart takes a merged chart off with every series it draws', () => {
    expect(withoutChart([mergedChart(['a', 0], ['b', 1]), ...canvasOf('c')], 'a')).toEqual(canvasOf('c'));
  });

  it('withoutSeries takes one series out of the chart it is merged into and numbers the axes left from the first again', () => {
    const canvas = [mergedChart(['a', 0], ['b', 1], ['c', 0]), ...canvasOf('m')];

    expect(withoutSeries(canvas, 'a', unitOf)).toEqual([mergedChart(['b', 0], ['c', 1]), ...canvasOf('m')]);
    expect(withoutSeries(canvas, 'b', unitOf)).toEqual([mergedChart(['a', 0], ['c', 0]), ...canvasOf('m')]);
  });

  it('withoutSeries takes a chart off the canvas once its only series leaves it', () => {
    expect(withoutSeries(canvasOf('a', 'b'), 'a', unitOf)).toEqual(canvasOf('b'));
  });
});

describe('normalizedCanvas', () => {
  it('normalizedCanvas numbers every chart’s axes from its first series, one axis per unit it was saved sharing', () => {
    expect(normalizedCanvas([mergedChart(['b', 2], ['a', 1], ['c', 1]), mergedChart(['m', 3])], unitOf)).toEqual([
      mergedChart(['b', 0], ['a', 1], ['c', 1]),
      mergedChart(['m', 0]),
    ]);
  });

  it('normalizedCanvas gives series of different units that were saved on one axis an axis each', () => {
    expect(normalizedCanvas([mergedChart(['a', 0], ['b', 0], ['c', 0])], unitOf)).toEqual([mergedChart(['a', 0], ['b', 1], ['c', 0])]);
  });
});

describe('separatedChart', () => {
  it('separatedChart puts every series of a merged chart back on a chart of its own, where the merged chart stood', () => {
    expect(separatedChart([...canvasOf('x'), mergedChart(['a', 0], ['b', 1], ['c', 0]), ...canvasOf('y')], 'a')).toEqual(canvasOf('x', 'a', 'b', 'c', 'y'));
  });

  it('separatedChart spreads a merged chart past five charts on the canvas', () => {
    const canvas = [mergedChart(['a', 0], ['b', 1], ['c', 0]), ...canvasOf('m', 'n', 'x')];

    expect(separatedChart(canvas, 'a')).toEqual(canvasOf('a', 'b', 'c', 'm', 'n', 'x'));
  });

  it('separatedChart leaves a chart of one series, or one not on the canvas, as it was', () => {
    const canvas = canvasOf('a', 'b');

    expect(separatedChart(canvas, 'a')).toBe(canvas);
    expect(separatedChart(canvas, 'z')).toBe(canvas);
  });
});

describe('withSeriesMergedFirst', () => {
  it('draws the series asked for on one merged chart at the top, taking each from wherever it was drawn, one axis per unit', () => {
    const canvas = [mergedChart(['a', 0], ['b', 1]), ...canvasOf('m', 'c')];

    expect(withSeriesMergedFirst(canvas, ['c', 'n', 'b', 'c'], traitsOf)).toEqual([mergedChart(['c', 0], ['n', 1], ['b', 2]), ...canvasOf('a', 'm')]);
  });

  it('plots a single series on a chart of its own, as plotting it would', () => {
    expect(withSeriesMergedFirst(canvasOf('a'), ['m'], traitsOf)).toEqual(canvasOf('a', 'm'));
    expect(withSeriesMergedFirst(canvasOf('a'), [], traitsOf)).toEqual(canvasOf('a'));
  });

  it('merges five series at most, and gives each one past them a chart of its own', () => {
    expect(withSeriesMergedFirst([], ['a', 'b', 'c', 'm', 'n', 'x'], traitsOf)).toEqual([
      mergedChart(['a', 0], ['b', 1], ['c', 0], ['m', 2], ['n', 2]),
      ...canvasOf('x'),
    ]);
  });
});
