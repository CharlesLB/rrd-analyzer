import * as R from 'remeda';

const FILLING_ROWS = 3;
const COMPACT_FILLING_ROWS = 2;
const ONE_COLUMN = 1;
const TWO_COLUMNS = 2;
const THREE_COLUMNS = 3;
const CHARTS_FOR_TWO_COLUMNS = 4;
const CHARTS_FOR_THREE_COLUMNS = 9;
const FILLING_ROW = 'minmax(0,1fr)';
const SCROLLING_ROW = 'minmax(230px,1fr)';
const AUTOMATIC = 'auto';
const HIDDEN_OVERFLOW = 'hidden';

export type ChartHeight = number | null;

type CanvasGrid = {
  readonly columns: string;
  readonly rows: string;
  readonly autoRows: string;
  readonly overflow: string;
};

const columnCountOf = (chartCount: number, isCompact: boolean): number => {
  if (isCompact || chartCount < CHARTS_FOR_TWO_COLUMNS) {
    return ONE_COLUMN;
  }

  return chartCount < CHARTS_FOR_THREE_COLUMNS ? TWO_COLUMNS : THREE_COLUMNS;
};

const tallestOf = (rowHeights: readonly ChartHeight[]): ChartHeight => {
  const given = R.filter(rowHeights, R.isNonNullish);

  return given.length === 0 ? null : Math.max(...given);
};

const rowOf = (height: ChartHeight, fills: boolean): string => {
  if (height !== null) {
    return `${height}px`;
  }

  return fills ? FILLING_ROW : SCROLLING_ROW;
};

export const leavesRoomBelowTheCharts = (chartHeights: readonly ChartHeight[]): boolean => chartHeights.every(R.isNonNullish);

export const canvasGridOf = (chartHeights: readonly ChartHeight[], isCompact: boolean): CanvasGrid => {
  const columnCount = columnCountOf(chartHeights.length, isCompact);
  const rowHeights = R.chunk(chartHeights, columnCount).map(tallestOf);
  const fills = rowHeights.length <= (isCompact ? COMPACT_FILLING_ROWS : FILLING_ROWS) && chartHeights.every(R.isNullish);
  const rows = rowHeights.length === 0 ? [FILLING_ROW] : R.map(rowHeights, (height) => rowOf(height, fills));

  return {
    columns: `repeat(${columnCount}, minmax(0, 1fr))`,
    rows: rows.join(' '),
    autoRows: AUTOMATIC,
    overflow: fills ? HIDDEN_OVERFLOW : AUTOMATIC,
  };
};
