import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';
import {
  draggedWindowOf,
  nudgedWindowOf,
  overviewArtOf,
  recentredWindowOf,
  STRIP_HANDLES,
  type StripGesture,
  stripTicksOf,
  stripWindowPlacementOf,
} from './timeline-strip';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STEP = 5 * MILLISECONDS_PER_MINUTE;
const BOUNDS: TimeRange = { fromMilliseconds: new Date(2026, 6, 30, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };
const WINDOW: TimeRange = { fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };

const MIDDLE_WINDOW: TimeRange = { fromMilliseconds: new Date(2026, 7, 14, 3, 0).getTime(), untilMilliseconds: new Date(2026, 7, 15, 3, 0).getTime() };

const onAStepOf = (instant: number, step: number): number => Math.round(instant / step) * step;

const gestureOf = (handle: StripGesture['handle'], anchorFraction: number, window = WINDOW): StripGesture => ({ handle, anchorFraction, window });

describe('stripTicksOf', () => {
  it('marks six days across the file range, the first left-aligned and the last right-aligned', () => {
    const ticks = stripTicksOf(BOUNDS, MONTHS);

    expect(ticks.map((tick) => tick.label)).toEqual(['30 Jul', '5 Aug', '11 Aug', '17 Aug', '23 Aug', '29 Aug']);
    expect(ticks.map((tick) => tick.left)).toEqual(['0.00%', '20.00%', '40.00%', '60.00%', '80.00%', '100.00%']);
    expect(ticks.map((tick) => tick.transform)).toEqual([
      'none',
      'translateX(-50%)',
      'translateX(-50%)',
      'translateX(-50%)',
      'translateX(-50%)',
      'translateX(-100%)',
    ]);
  });
});

describe('stripTicksOf a short range', () => {
  it('adds the time to every label once two ticks would fall on the same day, so no date is written twice', () => {
    const twoDays: TimeRange = { fromMilliseconds: new Date(2026, 7, 27, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };

    expect(stripTicksOf(twoDays, MONTHS).map((tick) => tick.label)).toEqual([
      '27 Aug 15:00',
      '28 Aug 00:36',
      '28 Aug 10:12',
      '28 Aug 19:48',
      '29 Aug 05:24',
      '29 Aug 15:00',
    ]);
  });
});

describe('stripWindowPlacementOf', () => {
  it('places the window on the file range as a share of it', () => {
    expect(stripWindowPlacementOf(WINDOW, BOUNDS)).toEqual({ startLeft: '96.67%', endLeft: '100.00%', width: '3.33%', isNarrow: false });
  });

  it('calls a window under three percent of the range narrow, so its handles can step outside it and leave the body free', () => {
    const hour: TimeRange = { fromMilliseconds: WINDOW.fromMilliseconds, untilMilliseconds: WINDOW.fromMilliseconds + MILLISECONDS_PER_HOUR };

    expect(stripWindowPlacementOf(hour, BOUNDS).isNarrow).toBe(true);
  });
});

describe('overviewArtOf', () => {
  it('spreads the readings over their own range, twenty units tall two units below the top', () => {
    expect(overviewArtOf([10, 20, 15])).toEqual({
      line: 'M0.0 22.0 L500.0 2.0 L1000.0 12.0',
      area: 'M0.0 24 L0.0 22.0 L500.0 2.0 L1000.0 12.0 L1000.0 24 L0.0 24 Z',
    });
  });

  it('breaks the line and the area at a gap, and draws nothing at all without a reading', () => {
    expect(overviewArtOf([10, null, 20]).line).toBe('M0.0 22.0 M1000.0 2.0');
    expect(overviewArtOf([null, null])).toEqual({ line: '', area: '' });
  });
});

describe('recentredWindowOf', () => {
  it('centres the window on the point that was pressed, keeping its length', () => {
    const recentred = recentredWindowOf(WINDOW, 0.5, BOUNDS);

    expect(recentred.untilMilliseconds - recentred.fromMilliseconds).toBe(24 * MILLISECONDS_PER_HOUR);
    expect(recentred.fromMilliseconds).toBe(new Date(2026, 7, 14, 3, 0).getTime());
  });

  it('a press at the very start keeps the whole window inside the data', () => {
    expect(recentredWindowOf(WINDOW, 0, BOUNDS).fromMilliseconds).toBe(BOUNDS.fromMilliseconds);
  });
});

describe('draggedWindowOf', () => {
  it('dragging the body moves both ends by the same distance', () => {
    const dragged = draggedWindowOf(gestureOf(STRIP_HANDLES.BODY, 0.9), 0.8, BOUNDS, STEP);

    expect(dragged.untilMilliseconds - dragged.fromMilliseconds).toBe(24 * MILLISECONDS_PER_HOUR);
    expect(dragged.fromMilliseconds).toBe(WINDOW.fromMilliseconds - 3 * 24 * MILLISECONDS_PER_HOUR);
  });

  it('dragging a handle moves that end alone', () => {
    expect(draggedWindowOf(gestureOf(STRIP_HANDLES.START, 0.5, MIDDLE_WINDOW), 0.4, BOUNDS, STEP)).toEqual({
      fromMilliseconds: MIDDLE_WINDOW.fromMilliseconds - 3 * 24 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: MIDDLE_WINDOW.untilMilliseconds,
    });
    expect(draggedWindowOf(gestureOf(STRIP_HANDLES.END, 0.5, MIDDLE_WINDOW), 0.6, BOUNDS, STEP)).toEqual({
      fromMilliseconds: MIDDLE_WINDOW.fromMilliseconds,
      untilMilliseconds: MIDDLE_WINDOW.untilMilliseconds + 3 * 24 * MILLISECONDS_PER_HOUR,
    });
  });

  it('a handle never crosses the other end, stopping fifteen minutes short of it', () => {
    expect(draggedWindowOf(gestureOf(STRIP_HANDLES.START, 0.5), 1, BOUNDS, STEP).fromMilliseconds).toBe(
      WINDOW.untilMilliseconds - 15 * MILLISECONDS_PER_MINUTE,
    );
    expect(draggedWindowOf(gestureOf(STRIP_HANDLES.END, 0.5), 0, BOUNDS, STEP).untilMilliseconds).toBe(WINDOW.fromMilliseconds + 15 * MILLISECONDS_PER_MINUTE);
  });

  it('lands both ends on the step the data is stored at', () => {
    const dragged = draggedWindowOf(gestureOf(STRIP_HANDLES.BODY, 0.5), 0.123_456, BOUNDS, STEP);

    expect(dragged.fromMilliseconds % STEP).toBe(0);
    expect(dragged.untilMilliseconds % STEP).toBe(0);
  });
});

describe('nudgedWindowOf', () => {
  it('moves the handle by a two-hundredth of the range per key press, or by one step when that is longer, and holds it inside the data', () => {
    const nudge = (BOUNDS.untilMilliseconds - BOUNDS.fromMilliseconds) / 200;
    const onAStep = (instant: number): number => Math.round(instant / STEP) * STEP;

    expect(nudge).toBeGreaterThan(STEP);
    expect(nudgedWindowOf(STRIP_HANDLES.START, MIDDLE_WINDOW, -1, BOUNDS, STEP)).toEqual({
      fromMilliseconds: onAStep(MIDDLE_WINDOW.fromMilliseconds - nudge),
      untilMilliseconds: MIDDLE_WINDOW.untilMilliseconds,
    });
    expect(nudgedWindowOf(STRIP_HANDLES.BODY, MIDDLE_WINDOW, 1, BOUNDS, STEP)).toEqual({
      fromMilliseconds: onAStep(MIDDLE_WINDOW.fromMilliseconds + nudge),
      untilMilliseconds: onAStep(MIDDLE_WINDOW.untilMilliseconds + nudge),
    });
    expect(nudgedWindowOf(STRIP_HANDLES.END, WINDOW, 1, BOUNDS, STEP)).toEqual(WINDOW);
    expect(nudgedWindowOf(STRIP_HANDLES.START, MIDDLE_WINDOW, 1, BOUNDS, nudge * 4).fromMilliseconds).toBe(
      onAStepOf(MIDDLE_WINDOW.fromMilliseconds + nudge * 4, nudge * 4),
    );
  });
});
