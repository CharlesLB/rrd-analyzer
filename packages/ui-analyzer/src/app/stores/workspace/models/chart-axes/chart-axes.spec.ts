import { describe, expect, it } from 'vitest';
import type { PlottedChart } from '../plotted-chart/plotted-chart';
import { chartFixture } from '../plotted-chart/plotted-chart.fixture';
import { axesOf, axisChoicesOf, axisFor, mergedChart, normalizedChart, type SeriesTraits, seriesOnAxis, seriesTraitsOf, withSeriesOnAxis } from './chart-axes';

const TRAITS: Readonly<Record<string, SeriesTraits>> = {
  cpu: { unit: '%', magnitude: 38 },
  system: { unit: '%', magnitude: 11 },
  cores: { unit: '%', magnitude: 390 },
  memory: { unit: 'B', magnitude: 5.4e9 },
  pause: { unit: 'ms', magnitude: 3.2 },
  latency: { unit: 'ms', magnitude: 180 },
  queue: { unit: 'ms', magnitude: 24 },
  unread: { unit: 'ms', magnitude: null },
};

const traitsOf = (seriesId: string): SeriesTraits => TRAITS[seriesId] ?? { unit: '', magnitude: null };

const unitOf = (seriesId: string): string => traitsOf(seriesId).unit;

const chartOf = (...plotted: readonly (readonly [string, number])[]): PlottedChart => chartFixture(...plotted.map(([seriesId, axis]) => ({ seriesId, axis })));

describe('seriesTraitsOf', () => {
  it('seriesTraitsOf a series takes its unit and the largest distance from zero it reaches in the window', () => {
    const statistics = { minimum: -40, maximum: 12, average: 0, percentile95: 10, last: 3, gapCount: 0 };

    expect(seriesTraitsOf({ id: 's1', file: '', name: '', label: '', unit: 'ms', color: '', stepMilliseconds: 1 }, statistics)).toEqual({
      unit: 'ms',
      magnitude: 40,
    });
  });

  it('seriesTraitsOf a series with no reading in the window knows its unit and nothing of its size', () => {
    expect(seriesTraitsOf(undefined, null)).toEqual({ unit: '', magnitude: null });
  });
});

describe('axesOf', () => {
  it('axesOf a chart lists each axis once, in the order its series first use them', () => {
    expect(axesOf(chartOf(['cpu', 0], ['memory', 1], ['system', 0]))).toEqual([0, 1]);
    expect(seriesOnAxis(chartOf(['cpu', 0], ['memory', 1], ['system', 0]), 0)).toEqual([
      { seriesId: 'cpu', axis: 0 },
      { seriesId: 'system', axis: 0 },
    ]);
  });
});

describe('axisFor', () => {
  it('axisFor a series of the unit an axis already reads, at a readable size beside it, is that axis', () => {
    expect(axisFor(chartOf(['cpu', 0], ['memory', 1]), 'system', traitsOf)).toBe(0);
  });

  it('axisFor a series of a unit no axis reads is a new axis', () => {
    expect(axisFor(chartOf(['cpu', 0]), 'memory', traitsOf)).toBe(1);
  });

  it('axisFor a series of the same unit but ten times the size or more is a new axis, rather than a flat line along the bottom of the other', () => {
    expect(axisFor(chartOf(['pause', 0]), 'latency', traitsOf)).toBe(1);
    expect(axisFor(chartOf(['latency', 0]), 'queue', traitsOf)).toBe(0);
  });

  it('axisFor a series that would stretch an axis already shared past ten times its smallest series is a new axis', () => {
    expect(axisFor(chartOf(['pause', 0], ['queue', 0]), 'latency', traitsOf)).toBe(1);
  });

  it('axisFor percentages reads them against the hundred their axis always shows, so only a series well past a hundred leaves', () => {
    expect(axisFor(chartOf(['system', 0]), 'cpu', traitsOf)).toBe(0);
    expect(axisFor(chartOf(['cpu', 0]), 'cores', traitsOf)).toBe(0);
  });

  it('axisFor a series whose size is not known yet goes by its unit alone', () => {
    expect(axisFor(chartOf(['latency', 0]), 'unread', traitsOf)).toBe(0);
  });
});

describe('normalizedChart', () => {
  it('normalizedChart numbers the axes from the first series on, with no number skipped', () => {
    expect(normalizedChart(chartOf(['memory', 4], ['cpu', 2], ['system', 2]), unitOf)).toEqual(chartOf(['memory', 0], ['cpu', 1], ['system', 1]));
  });

  it('normalizedChart keeps apart series of one unit a person put on separate axes', () => {
    expect(normalizedChart(chartOf(['pause', 0], ['latency', 1]), unitOf)).toEqual(chartOf(['pause', 0], ['latency', 1]));
  });

  it('normalizedChart never lets one axis read two units, giving the second unit an axis of its own', () => {
    expect(normalizedChart(chartOf(['cpu', 0], ['memory', 0], ['system', 0]), unitOf)).toEqual(chartOf(['cpu', 0], ['memory', 1], ['system', 0]));
  });
});

describe('mergedChart', () => {
  it('mergedChart of two percentages draws both against the one percentage axis', () => {
    expect(mergedChart(chartOf(['cpu', 0]), chartOf(['system', 0]), traitsOf)).toEqual(chartOf(['cpu', 0], ['system', 0]));
  });

  it('mergedChart of a percentage and a byte count gives each its own axis, never converting either', () => {
    expect(mergedChart(chartOf(['cpu', 0]), chartOf(['memory', 0]), traitsOf)).toEqual(chartOf(['cpu', 0], ['memory', 1]));
  });

  it('mergedChart of a merged chart brings each of its series to the axis that suits it, so two percentages share one across both charts', () => {
    expect(mergedChart(chartOf(['cpu', 0], ['memory', 1]), chartOf(['system', 0], ['latency', 1]), traitsOf)).toEqual(
      chartOf(['cpu', 0], ['memory', 1], ['system', 0], ['latency', 2]),
    );
  });
});

describe('axisChoicesOf', () => {
  it('axisChoicesOf a series offers every axis that reads its unit, and a new axis while it shares its own', () => {
    expect(axisChoicesOf(chartOf(['cpu', 0], ['memory', 1], ['system', 0]), 'system', unitOf)).toEqual([
      { axis: 0, isNew: false },
      { axis: 2, isNew: true },
    ]);
  });

  it('axisChoicesOf a series alone on its axis offers no new axis, since it already has one to itself', () => {
    expect(axisChoicesOf(chartOf(['cpu', 0], ['memory', 1], ['system', 2]), 'system', unitOf)).toEqual([
      { axis: 0, isNew: false },
      { axis: 2, isNew: false },
    ]);
  });

  it('axisChoicesOf never offers an axis of another unit', () => {
    expect(axisChoicesOf(chartOf(['cpu', 0], ['memory', 1]), 'memory', unitOf)).toEqual([{ axis: 1, isNew: false }]);
  });
});

describe('withSeriesOnAxis', () => {
  it('withSeriesOnAxis moves a series onto an axis of its unit that another series already reads', () => {
    expect(withSeriesOnAxis(chartOf(['latency', 0], ['cpu', 1], ['pause', 2]), 'pause', 0, unitOf)).toEqual(chartOf(['latency', 0], ['cpu', 1], ['pause', 0]));
  });

  it('withSeriesOnAxis gives a series an axis of its own, numbered after the others', () => {
    expect(withSeriesOnAxis(chartOf(['cpu', 0], ['system', 0], ['memory', 1]), 'system', 2, unitOf)).toEqual(chartOf(['cpu', 0], ['system', 1], ['memory', 2]));
  });

  it('withSeriesOnAxis keeps the first series on the first axis when it is the one given an axis of its own', () => {
    expect(withSeriesOnAxis(chartOf(['cpu', 0], ['system', 0], ['memory', 1]), 'cpu', 2, unitOf)).toEqual(chartOf(['cpu', 0], ['system', 1], ['memory', 2]));
  });

  it('withSeriesOnAxis refuses to read a series against an axis of another unit, giving it one of its own instead', () => {
    expect(withSeriesOnAxis(chartOf(['cpu', 0], ['memory', 1]), 'memory', 0, unitOf)).toEqual(chartOf(['cpu', 0], ['memory', 1]));
  });
});
