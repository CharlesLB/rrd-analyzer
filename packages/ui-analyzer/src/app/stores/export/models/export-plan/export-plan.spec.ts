import { describe, expect, it } from 'vitest';
import { chartFixture } from '../../../workspace/models/plotted-chart/plotted-chart.fixture';
import { CPU_USER_SERIES, MEMORY_USED_SERIES } from '../../../workspace/models/series/series.fixture';
import { exportPlansOf, planTitleOf } from './export-plan';

const seriesById = new Map([CPU_USER_SERIES, MEMORY_USED_SERIES].map((series) => [series.id, series] as const));

const CANVAS = [
  chartFixture({ seriesId: CPU_USER_SERIES.id, axis: 0 }, { seriesId: MEMORY_USED_SERIES.id, axis: 1 }),
  chartFixture({ seriesId: 'gone', axis: 0 }),
];

describe('exportPlansOf', () => {
  it('exportPlansOf plans one export per chart asked for, with the series it draws and the axis of each', () => {
    const [merged] = exportPlansOf(CANVAS, seriesById, [CPU_USER_SERIES.id]);

    expect(merged?.lines).toEqual([
      { series: CPU_USER_SERIES, axis: 0 },
      { series: MEMORY_USED_SERIES, axis: 1 },
    ]);
  });

  it('exportPlansOf leaves out a chart the canvas does not have and one whose series the library lost', () => {
    expect(exportPlansOf(CANVAS, seriesById, ['gone', 'never-there'])).toEqual([]);
  });
});

describe('planTitleOf', () => {
  it('planTitleOf names a plan after the series it draws, joined as the application joins them', () => {
    const [merged] = exportPlansOf(CANVAS, seriesById, [CPU_USER_SERIES.id]);

    expect(planTitleOf(merged ?? { lines: [] }, ' + ')).toBe(`${CPU_USER_SERIES.name} + ${MEMORY_USED_SERIES.name}`);
  });
});
