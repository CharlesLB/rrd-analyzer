import { describe, expect, it } from 'vitest';
import { absoluteDraftOf, showsWindow, typedRangeOf, withDayPicked, withFieldFocused, withMonthShown, withTextTyped } from './absolute-draft';

const WINDOW = { fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };
const DRAFT = absoluteDraftOf(WINDOW, undefined);

describe('absoluteDraftOf', () => {
  it('absoluteDraftOf a window writes both of its ends, focused on From, on the month of From', () => {
    expect(DRAFT).toEqual({ fromText: '2026-08-28 15:00', toText: '2026-08-29 15:00', focusedField: 'from', calendarMonth: null });
  });

  it('absoluteDraftOf a new window rewrites the ends but keeps the field and the month being looked at', () => {
    const looking = withMonthShown(withFieldFocused(withTextTyped(DRAFT, 'from', 'typed'), 'to'), 1);

    expect(absoluteDraftOf(WINDOW, looking)).toEqual({ ...DRAFT, focusedField: 'to', calendarMonth: 1 });
  });
});

describe('withDayPicked', () => {
  it('withDayPicked fills From keeping its time and hands the focus to To, which it fills after', () => {
    const fromPicked = withDayPicked(DRAFT, new Date(2026, 7, 22).getTime());
    const bothPicked = withDayPicked(fromPicked, new Date(2026, 7, 24).getTime());

    expect(fromPicked).toMatchObject({ fromText: '2026-08-22 15:00', focusedField: 'to' });
    expect(typedRangeOf(bothPicked)).toEqual({ from: '2026-08-22 15:00', to: '2026-08-24 15:00' });
  });

  it('withDayPicked a From later than To, or a To earlier than From, swaps the two ends so the range still runs forward', () => {
    const lateFrom = withDayPicked(DRAFT, new Date(2026, 7, 30).getTime());
    const earlyTo = withDayPicked(withFieldFocused(DRAFT, 'to'), new Date(2026, 7, 20).getTime());

    expect(typedRangeOf(lateFrom)).toEqual({ from: '2026-08-29 15:00', to: '2026-08-30 15:00' });
    expect(typedRangeOf(earlyTo)).toEqual({ from: '2026-08-20 15:00', to: '2026-08-28 15:00' });
  });
});

describe('showsWindow', () => {
  it('showsWindow is true only while both ends still read as the window on screen', () => {
    expect(showsWindow(DRAFT, WINDOW)).toBe(true);
    expect(showsWindow(withTextTyped(DRAFT, 'to', '2026-08-29 16:00'), WINDOW)).toBe(false);
  });
});
