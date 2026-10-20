import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE, type QuickPresetMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { memberOf } from '../../../../shared/utils/constant-member/constant-member.util';
import { formatFullTimestamp } from '../../../../shared/utils/date-format/date-format.util';

export type TimeRange = {
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
};

export type TimestampRange = {
  readonly from: string;
  readonly to: string;
};

export type ChartCursor = {
  readonly fraction: number;
  readonly chartId: string | null;
};

export type SelectionDraft = {
  readonly anchorFraction: number;
  readonly focusFraction: number;
};

export type SelectionExtent = {
  readonly start: number;
  readonly end: number;
};

export type QuickPresetKey = keyof QuickPresetMessages;

export type QuickPreset = {
  readonly key: QuickPresetKey;
  readonly milliseconds: number;
};

export const QUICK_PRESETS: readonly QuickPreset[] = [
  { key: 'last15Minutes', milliseconds: 15 * MILLISECONDS_PER_MINUTE },
  { key: 'last30Minutes', milliseconds: 30 * MILLISECONDS_PER_MINUTE },
  { key: 'last1Hour', milliseconds: MILLISECONDS_PER_HOUR },
  { key: 'last6Hours', milliseconds: 6 * MILLISECONDS_PER_HOUR },
  { key: 'last12Hours', milliseconds: 12 * MILLISECONDS_PER_HOUR },
  { key: 'last24Hours', milliseconds: 24 * MILLISECONDS_PER_HOUR },
  { key: 'last7Days', milliseconds: 7 * MILLISECONDS_PER_DAY },
  { key: 'last30Days', milliseconds: 30 * MILLISECONDS_PER_DAY },
  { key: 'last3Months', milliseconds: 90 * MILLISECONDS_PER_DAY },
];

export const TIMEFRAME_TABS = {
  QUICK: 'quick',
  ABSOLUTE: 'absolute',
} as const;

export type TimeframeTab = ValueOf<typeof TIMEFRAME_TABS>;

export const QUICK_UNITS = {
  MINUTES: 'minutes',
  HOURS: 'hours',
  DAYS: 'days',
} as const;

export type QuickUnit = ValueOf<typeof QUICK_UNITS>;

export const QUICK_UNIT_MILLISECONDS: Readonly<Record<QuickUnit, number>> = {
  [QUICK_UNITS.MINUTES]: MILLISECONDS_PER_MINUTE,
  [QUICK_UNITS.HOURS]: MILLISECONDS_PER_HOUR,
  [QUICK_UNITS.DAYS]: MILLISECONDS_PER_DAY,
};

export const DEFAULT_QUICK_COUNT = '24';

export const isQuickUnit = (value: string): value is QuickUnit => memberOf(QUICK_UNITS, value) !== undefined;

export const SHIFT_DIRECTIONS = {
  BACKWARD: -1,
  FORWARD: 1,
} as const;

export type ShiftDirection = ValueOf<typeof SHIFT_DIRECTIONS>;

export const CHART_COLUMNS = 260;
export const THUMBNAIL_COLUMNS = 90;
export const OVERVIEW_COLUMNS = 240;
export const MINIMUM_WINDOW_MILLISECONDS = 15 * MILLISECONDS_PER_MINUTE;
export const DEFAULT_WINDOW_MILLISECONDS = 24 * MILLISECONDS_PER_HOUR;
export const UNKNOWN_STEP_MILLISECONDS = 1;

const PRESET_TOLERANCE = 0.02;
const NEAR_NOW_STEPS = 2;

export const spanOf = (range: TimeRange): number => range.untilMilliseconds - range.fromMilliseconds;

export const instantAt = (range: TimeRange, fraction: number): number => range.fromMilliseconds + spanOf(range) * fraction;

export const timestampRangeOf = (range: TimeRange): TimestampRange => ({
  from: formatFullTimestamp(range.fromMilliseconds),
  to: formatFullTimestamp(range.untilMilliseconds),
});

export const trailingWindow = (untilMilliseconds: number, milliseconds: number): TimeRange => ({
  fromMilliseconds: untilMilliseconds - milliseconds,
  untilMilliseconds,
});

const instantWithin = (instant: number, bounds: TimeRange): number => R.clamp(instant, { min: bounds.fromMilliseconds, max: bounds.untilMilliseconds });

export const clampWindow = (requested: TimeRange, bounds: TimeRange): TimeRange => {
  const widenedUntil = Math.max(requested.untilMilliseconds, requested.fromMilliseconds + MINIMUM_WINDOW_MILLISECONDS);
  const fromMilliseconds = instantWithin(requested.fromMilliseconds, bounds);
  const untilMilliseconds = instantWithin(widenedUntil, bounds);

  if (untilMilliseconds - fromMilliseconds >= MINIMUM_WINDOW_MILLISECONDS) {
    return { fromMilliseconds, untilMilliseconds };
  }

  const reachedUntil = Math.min(bounds.untilMilliseconds, fromMilliseconds + MINIMUM_WINDOW_MILLISECONDS);

  return { fromMilliseconds: Math.max(bounds.fromMilliseconds, reachedUntil - MINIMUM_WINDOW_MILLISECONDS), untilMilliseconds: reachedUntil };
};

export const dayShiftedWindow = (range: TimeRange, direction: ShiftDirection, bounds: TimeRange): TimeRange => {
  const span = Math.min(spanOf(range), spanOf(bounds));
  const shifted = range.fromMilliseconds + MILLISECONDS_PER_DAY * direction;
  const fromMilliseconds = Math.min(Math.max(shifted, bounds.fromMilliseconds), bounds.untilMilliseconds - span);

  return { fromMilliseconds, untilMilliseconds: fromMilliseconds + span };
};

export const matchingPreset = (range: TimeRange, dataUntilMilliseconds: number, stepMilliseconds: number): QuickPreset | undefined => {
  if (Math.abs(range.untilMilliseconds - dataUntilMilliseconds) >= stepMilliseconds * NEAR_NOW_STEPS) {
    return undefined;
  }

  const span = spanOf(range);

  return R.find(QUICK_PRESETS, (preset) => Math.abs(span - preset.milliseconds) < preset.milliseconds * PRESET_TOLERANCE);
};

export const selectionExtentOf = (selection: SelectionDraft): SelectionExtent => ({
  start: Math.min(selection.anchorFraction, selection.focusFraction),
  end: Math.max(selection.anchorFraction, selection.focusFraction),
});
