import { ABSOLUTE_FIELDS, type AbsoluteField, parseAbsoluteTimestamp, timestampOnDay } from '../../../../stores/time-window/models/absolute-time/absolute-time';
import { type TimeRange, type TimestampRange, timestampRangeOf } from '../../../../stores/workspace/models/timeframe/timeframe';

export type AbsoluteDraft = {
  readonly fromText: string;
  readonly toText: string;
  readonly focusedField: AbsoluteField;
  readonly calendarMonth: number | null;
};

export const absoluteDraftOf = (window: TimeRange, previous: AbsoluteDraft | undefined): AbsoluteDraft => {
  const { from, to } = timestampRangeOf(window);

  return { fromText: from, toText: to, focusedField: previous?.focusedField ?? ABSOLUTE_FIELDS.FROM, calendarMonth: previous?.calendarMonth ?? null };
};

export const withTextTyped = (draft: AbsoluteDraft, field: AbsoluteField, text: string): AbsoluteDraft =>
  field === ABSOLUTE_FIELDS.FROM ? { ...draft, fromText: text } : { ...draft, toText: text };

export const withFieldFocused = (draft: AbsoluteDraft, field: AbsoluteField): AbsoluteDraft => ({ ...draft, focusedField: field });

export const withMonthShown = (draft: AbsoluteDraft, monthStartMilliseconds: number): AbsoluteDraft => ({ ...draft, calendarMonth: monthStartMilliseconds });

const endsInOrder = (draft: AbsoluteDraft): AbsoluteDraft => {
  const fromMilliseconds = parseAbsoluteTimestamp(draft.fromText);
  const untilMilliseconds = parseAbsoluteTimestamp(draft.toText);

  return fromMilliseconds !== null && untilMilliseconds !== null && fromMilliseconds > untilMilliseconds
    ? { ...draft, fromText: draft.toText, toText: draft.fromText }
    : draft;
};

export const withDayPicked = (draft: AbsoluteDraft, dayStartMilliseconds: number): AbsoluteDraft =>
  endsInOrder(
    draft.focusedField === ABSOLUTE_FIELDS.FROM
      ? { ...draft, fromText: timestampOnDay(dayStartMilliseconds, draft.fromText, ABSOLUTE_FIELDS.FROM), focusedField: ABSOLUTE_FIELDS.TO }
      : { ...draft, toText: timestampOnDay(dayStartMilliseconds, draft.toText, ABSOLUTE_FIELDS.TO) },
  );

export const showsWindow = (draft: AbsoluteDraft, window: TimeRange): boolean => {
  const { from, to } = timestampRangeOf(window);

  return draft.fromText === from && draft.toText === to;
};

export const typedRangeOf = (draft: AbsoluteDraft): TimestampRange => ({ from: draft.fromText, to: draft.toText });
