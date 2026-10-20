export const MINIMUM_CHART_HEIGHT = 160;
export const MAXIMUM_CHART_HEIGHT = 1200;

const KEYBOARD_STEP = 16;

export type ChartResizeGesture = {
  readonly anchorClientY: number;
  readonly anchorHeight: number;
  readonly heightBefore: number | null;
};

export const startedResize = (clientY: number, height: number, heightBefore: number | null = null): ChartResizeGesture => ({
  anchorClientY: clientY,
  anchorHeight: height,
  heightBefore,
});

export const resizedHeightOf = (gesture: ChartResizeGesture, clientY: number): number =>
  Math.round(Math.min(MAXIMUM_CHART_HEIGHT, Math.max(MINIMUM_CHART_HEIGHT, gesture.anchorHeight + clientY - gesture.anchorClientY)));

export const nudgedHeightOf = (height: number, direction: number): number => resizedHeightOf(startedResize(0, height), direction * KEYBOARD_STEP);
