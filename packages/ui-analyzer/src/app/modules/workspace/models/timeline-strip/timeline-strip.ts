import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { formatClockTime } from '../../../../shared/utils/date-format/date-format.util';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import { sampleExtentOf, scaledY, type VerticalBand } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { areaUnderPolylineOf, evenlySpacedPositionOf, gappedPolylineOf } from '../../../../shared/utils/svg-path/svg-path.util';
import { fractionAt } from '../../../../stores/time-window/models/range-fraction/range-fraction';
import type { SeriesSample } from '../../../../stores/workspace/models/series/series.model';
import { instantAt, MINIMUM_WINDOW_MILLISECONDS, spanOf, type TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';

const OVERVIEW_WIDTH = 1000;
const OVERVIEW_HEIGHT = 24;
const OVERVIEW_TOP = 2;
const OVERVIEW_DRAWABLE_HEIGHT = 20;
const OVERVIEW_BAND: VerticalBand = { top: OVERVIEW_TOP, height: OVERVIEW_DRAWABLE_HEIGHT };
const FLAT_SERIES_RANGE = 1;

const NARROW_WINDOW_SHARE = 0.03;
const NUDGES_ACROSS_THE_STRIP = 200;
const WHOLE_STRIP_PERCENT = 100;

const TICK_COUNT = 5;
const FIRST_TICK_TRANSFORM = 'none';
const LAST_TICK_TRANSFORM = 'translateX(-100%)';
const MIDDLE_TICK_TRANSFORM = 'translateX(-50%)';

export const OVERVIEW_VIEW_BOX = `0 0 ${OVERVIEW_WIDTH} ${OVERVIEW_HEIGHT}`;

export const STRIP_HANDLES = {
  START: 'start',
  END: 'end',
  BODY: 'body',
} as const;

export type StripHandle = ValueOf<typeof STRIP_HANDLES>;

export type StripGesture = {
  readonly handle: StripHandle;
  readonly anchorFraction: number;
  readonly window: TimeRange;
};

type StripTick = {
  readonly left: string;
  readonly label: string;
  readonly transform: string;
};

type StripWindowPlacement = {
  readonly startLeft: string;
  readonly endLeft: string;
  readonly width: string;
  readonly isNarrow: boolean;
};

type OverviewArt = {
  readonly line: string;
  readonly area: string;
};

const EMPTY_ART: OverviewArt = { line: '', area: '' };

const tickTransformOf = (index: number): string => {
  if (index === 0) {
    return FIRST_TICK_TRANSFORM;
  }

  return index === TICK_COUNT ? LAST_TICK_TRANSFORM : MIDDLE_TICK_TRANSFORM;
};

const dayLabelOf = (instantMilliseconds: number, monthAbbreviations: readonly string[]): string => {
  const moment = new Date(instantMilliseconds);

  return `${moment.getDate()} ${monthAbbreviations[moment.getMonth()]}`;
};

export const stripTicksOf = (bounds: TimeRange, monthAbbreviations: readonly string[]): readonly StripTick[] => {
  const instants = R.map(R.range(0, TICK_COUNT + 1), (index) => instantAt(bounds, index / TICK_COUNT));
  const days = R.map(instants, (instant) => dayLabelOf(instant, monthAbbreviations));
  const isDayRepeated = R.unique(days).length < days.length;

  return R.map(instants, (instant, index) => ({
    left: percentOf(index / TICK_COUNT),
    label: isDayRepeated ? `${days[index]} ${formatClockTime(instant)}` : `${days[index]}`,
    transform: tickTransformOf(index),
  }));
};

export const stripWindowPlacementOf = (window: TimeRange, bounds: TimeRange): StripWindowPlacement => {
  const start = fractionAt(bounds, window.fromMilliseconds);
  const end = fractionAt(bounds, window.untilMilliseconds);

  return { startLeft: percentOf(start), endLeft: percentOf(end), width: percentOf(end - start), isNarrow: end - start < NARROW_WINDOW_SHARE };
};

export const overviewArtOf = (samples: readonly SeriesSample[]): OverviewArt => {
  const extent = sampleExtentOf(samples);

  if (extent === null) {
    return EMPTY_ART;
  }

  const range = { lowest: extent.lowest, highest: extent.lowest === extent.highest ? extent.lowest + FLAT_SERIES_RANGE : extent.highest };

  const pointAt = (value: number, index: number) => ({
    x: evenlySpacedPositionOf(index, samples.length, OVERVIEW_WIDTH),
    y: scaledY(value, range, OVERVIEW_BAND),
  });

  return { line: gappedPolylineOf(samples, pointAt), area: areaUnderPolylineOf(samples, OVERVIEW_HEIGHT, pointAt) };
};

const clampedInside = (value: number, lowest: number, highest: number): number => Math.min(Math.max(value, lowest), highest);

const movedWindow = (window: TimeRange, fromMilliseconds: number, bounds: TimeRange): TimeRange => {
  const span = Math.min(spanOf(window), spanOf(bounds));
  const start = clampedInside(fromMilliseconds, bounds.fromMilliseconds, bounds.untilMilliseconds - span);

  return { fromMilliseconds: start, untilMilliseconds: start + span };
};

export const recentredWindowOf = (window: TimeRange, fraction: number, bounds: TimeRange): TimeRange =>
  movedWindow(window, instantAt(bounds, fraction) - spanOf(window) / 2, bounds);

const DRAGGED_BY_HANDLE: Readonly<Record<StripHandle, (window: TimeRange, shift: number, bounds: TimeRange) => TimeRange>> = {
  [STRIP_HANDLES.BODY]: (window, shift, bounds) => movedWindow(window, window.fromMilliseconds + shift, bounds),
  [STRIP_HANDLES.START]: (window, shift, bounds) => ({
    fromMilliseconds: clampedInside(window.fromMilliseconds + shift, bounds.fromMilliseconds, window.untilMilliseconds - MINIMUM_WINDOW_MILLISECONDS),
    untilMilliseconds: window.untilMilliseconds,
  }),
  [STRIP_HANDLES.END]: (window, shift, bounds) => ({
    fromMilliseconds: window.fromMilliseconds,
    untilMilliseconds: clampedInside(window.untilMilliseconds + shift, window.fromMilliseconds + MINIMUM_WINDOW_MILLISECONDS, bounds.untilMilliseconds),
  }),
};

const snappedToStep = (window: TimeRange, stepMilliseconds: number): TimeRange => ({
  fromMilliseconds: Math.round(window.fromMilliseconds / stepMilliseconds) * stepMilliseconds,
  untilMilliseconds: Math.round(window.untilMilliseconds / stepMilliseconds) * stepMilliseconds,
});

export const draggedWindowOf = (gesture: StripGesture, fraction: number, bounds: TimeRange, stepMilliseconds: number): TimeRange =>
  snappedToStep(DRAGGED_BY_HANDLE[gesture.handle](gesture.window, spanOf(bounds) * (fraction - gesture.anchorFraction), bounds), stepMilliseconds);

export const nudgedWindowOf = (handle: StripHandle, window: TimeRange, direction: number, bounds: TimeRange, stepMilliseconds: number): TimeRange =>
  snappedToStep(DRAGGED_BY_HANDLE[handle](window, direction * Math.max(stepMilliseconds, spanOf(bounds) / NUDGES_ACROSS_THE_STRIP), bounds), stepMilliseconds);

export const stripValuePercentOf = (instantMilliseconds: number, bounds: TimeRange): number =>
  Math.round(fractionAt(bounds, instantMilliseconds) * WHOLE_STRIP_PERCENT);
