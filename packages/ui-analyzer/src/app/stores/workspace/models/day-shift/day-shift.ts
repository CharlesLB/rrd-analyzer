import { formatMessage, type TimeNavMessages } from '@rrd-analyzer/shared';
import { formatShortTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import { dayShiftedWindow, SHIFT_DIRECTIONS, type ShiftDirection, type TimeRange } from '../timeframe/timeframe';

export type DayShift = {
  readonly direction: ShiftDirection;
  readonly window: TimeRange;
  readonly isAvailable: boolean;
  readonly title: string;
  readonly detail: string;
};

type ShiftWording = {
  readonly action: string;
  readonly edgeTitle: string;
  readonly edgeDetail: string;
};

const WORDING_OF: Readonly<Record<ShiftDirection, (texts: TimeNavMessages, bounds: TimeRange) => ShiftWording>> = {
  [SHIFT_DIRECTIONS.BACKWARD]: (texts, bounds) => ({
    action: texts.backOneDay,
    edgeTitle: texts.startOfData,
    edgeDetail: formatMessage(texts.filesBegin, { timestamp: formatShortTimestamp(bounds.fromMilliseconds) }),
  }),
  [SHIFT_DIRECTIONS.FORWARD]: (texts, bounds) => ({
    action: texts.forwardOneDay,
    edgeTitle: texts.endOfData,
    edgeDetail: formatMessage(texts.filesEnd, { timestamp: formatShortTimestamp(bounds.untilMilliseconds) }),
  }),
};

export const dayShiftOf = (window: TimeRange, direction: ShiftDirection, bounds: TimeRange, texts: TimeNavMessages): DayShift => {
  const shifted = dayShiftedWindow(window, direction, bounds);
  const wording = WORDING_OF[direction](texts, bounds);
  const isAvailable = shifted.fromMilliseconds !== window.fromMilliseconds;

  return {
    direction,
    window: shifted,
    isAvailable,
    title: isAvailable ? wording.action : wording.edgeTitle,
    detail: isAvailable
      ? formatMessage(texts.shiftedRange, { from: formatShortTimestamp(shifted.fromMilliseconds), to: formatShortTimestamp(shifted.untilMilliseconds) })
      : wording.edgeDetail,
  };
};
