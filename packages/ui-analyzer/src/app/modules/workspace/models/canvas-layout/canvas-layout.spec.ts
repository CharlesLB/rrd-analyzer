import { describe, expect, it } from 'vitest';
import { canvasGridOf, leavesRoomBelowTheCharts } from './canvas-layout';

const automatic = (count: number): readonly (number | null)[] => Array.from({ length: count }, () => null);

const ONE_COLUMN = 'repeat(1, minmax(0, 1fr))';
const TWO_COLUMNS = 'repeat(2, minmax(0, 1fr))';
const THREE_COLUMNS = 'repeat(3, minmax(0, 1fr))';

describe('canvasGridOf', () => {
  it('stacks up to three charts in one column over the whole height', () => {
    expect(canvasGridOf(automatic(0), false)).toEqual({ columns: ONE_COLUMN, rows: 'minmax(0,1fr)', autoRows: 'auto', overflow: 'hidden' });
    expect(canvasGridOf(automatic(3), false)).toEqual({
      columns: ONE_COLUMN,
      rows: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
      autoRows: 'auto',
      overflow: 'hidden',
    });
  });

  it('lays four charts out two by two, still filling the height', () => {
    expect(canvasGridOf(automatic(4), false)).toEqual({ columns: TWO_COLUMNS, rows: 'minmax(0,1fr) minmax(0,1fr)', autoRows: 'auto', overflow: 'hidden' });
  });

  it('keeps two columns up to eight charts, scrolling once they need more than three rows', () => {
    expect(canvasGridOf(automatic(8), false)).toEqual({
      columns: TWO_COLUMNS,
      rows: 'minmax(230px,1fr) minmax(230px,1fr) minmax(230px,1fr) minmax(230px,1fr)',
      autoRows: 'auto',
      overflow: 'auto',
    });
  });

  it('lays nine charts out three by three, and keeps three columns past them', () => {
    expect(canvasGridOf(automatic(9), false)).toEqual({
      columns: THREE_COLUMNS,
      rows: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
      autoRows: 'auto',
      overflow: 'hidden',
    });
    expect(canvasGridOf(automatic(14), false).columns).toBe(THREE_COLUMNS);
    expect(canvasGridOf(automatic(14), false).rows.split(' ')).toHaveLength(5);
  });

  it('keeps one column on a compact window, scrolling past two charts', () => {
    expect(canvasGridOf(automatic(6), true).columns).toBe(ONE_COLUMN);
    expect(canvasGridOf(automatic(3), true).overflow).toBe('auto');
  });

  it('gives a resized chart the height it was given, and lets the canvas scroll around it', () => {
    expect(canvasGridOf([420, null], false)).toEqual({ columns: ONE_COLUMN, rows: '420px minmax(230px,1fr)', autoRows: 'auto', overflow: 'auto' });
  });

  it('keeps every chart at the height it was given', () => {
    expect(canvasGridOf([420, 180], false).rows).toBe('420px 180px');
  });

  it('gives a row of the grid the height of the tallest chart resized in it', () => {
    expect(canvasGridOf([300, null, null, 180], false).rows).toBe('300px 180px');
  });
});

describe('leavesRoomBelowTheCharts', () => {
  it('leaves room below an empty canvas and below charts that were all given a height', () => {
    expect(leavesRoomBelowTheCharts([])).toBe(true);
    expect(leavesRoomBelowTheCharts([420, 180])).toBe(true);
  });

  it('leaves no room once a chart stretches to fill the height', () => {
    expect(leavesRoomBelowTheCharts([420, null])).toBe(false);
    expect(leavesRoomBelowTheCharts(automatic(2))).toBe(false);
  });
});
