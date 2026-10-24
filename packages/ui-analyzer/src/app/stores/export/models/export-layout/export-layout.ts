export const EXPORT_FRAME = {
  WIDTH: 1920,
  HEIGHT: 1080,
} as const;

export const EXPORT_MARGIN = 40;
export const BOLD_WEIGHT = 700;
export const FONT_STACK = 'Nunito, Helvetica, Arial, sans-serif';
export const AXIS_COLUMN_WIDTH = 96;

const HEADER_HEIGHT = 122;
const CHART_GAP = 18;
const TIME_AXIS_HEIGHT = 40;
const FOOTER_HEIGHT = 38;
const VALUE_GUTTER = 112;
const PLOT_RIGHT_PADDING = 24;
const PLOT_TOP_PADDING = 46;
const PLOT_BOTTOM_PADDING = 18;

export type PlotFrame = {
  readonly left: number;
  readonly width: number;
};

export type PlotArea = {
  readonly top: number;
  readonly height: number;
};

type ChartSlot = {
  readonly top: number;
  readonly height: number;
  readonly plot: PlotArea;
};

export const plotFrameOf = (axisColumnCount: number): PlotFrame => {
  const left = EXPORT_MARGIN + VALUE_GUTTER + (axisColumnCount - 1) * AXIS_COLUMN_WIDTH;

  return { left, width: EXPORT_FRAME.WIDTH - EXPORT_MARGIN - PLOT_RIGHT_PADDING - left };
};

const chartHeightOf = (chartCount: number): number =>
  (EXPORT_FRAME.HEIGHT - HEADER_HEIGHT - TIME_AXIS_HEIGHT - FOOTER_HEIGHT - CHART_GAP * (chartCount - 1)) / chartCount;

const chartTopOf = (index: number, chartCount: number): number => HEADER_HEIGHT + index * (chartHeightOf(chartCount) + CHART_GAP);

export const chartSlotOf = (index: number, chartCount: number): ChartSlot => {
  const top = chartTopOf(index, chartCount);
  const height = chartHeightOf(chartCount);

  return { top, height, plot: { top: top + PLOT_TOP_PADDING, height: height - PLOT_TOP_PADDING - PLOT_BOTTOM_PADDING } };
};

export const timeAxisTopOf = (chartCount: number): number => chartTopOf(chartCount, chartCount) - CHART_GAP;
