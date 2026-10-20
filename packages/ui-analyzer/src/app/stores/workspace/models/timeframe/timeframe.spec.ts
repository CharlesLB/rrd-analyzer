import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { clampWindow, dayShiftedWindow, instantAt, matchingPreset, SHIFT_DIRECTIONS, selectionExtentOf, type TimeRange, trailingWindow } from './timeframe';

const STEP = 5 * MILLISECONDS_PER_MINUTE;
const UNTIL = 1_788_026_400_000;
const BOUNDS: TimeRange = { fromMilliseconds: UNTIL - 30 * 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL };

describe('clampWindow', () => {
  it('keeps a window that already fits the data as it is', () => {
    const window = trailingWindow(UNTIL, 24 * MILLISECONDS_PER_HOUR);

    expect(clampWindow(window, BOUNDS)).toEqual(window);
  });

  it('widens a window shorter than fifteen minutes from its start', () => {
    expect(
      clampWindow(
        { fromMilliseconds: UNTIL - 2 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL - 2 * MILLISECONDS_PER_HOUR + MILLISECONDS_PER_MINUTE },
        BOUNDS,
      ),
    ).toEqual({
      fromMilliseconds: UNTIL - 2 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: UNTIL - 2 * MILLISECONDS_PER_HOUR + 15 * MILLISECONDS_PER_MINUTE,
    });
  });

  it('never reaches past the data, and pulls the start back when that leaves too little', () => {
    expect(clampWindow({ fromMilliseconds: UNTIL - 5 * MILLISECONDS_PER_MINUTE, untilMilliseconds: UNTIL + MILLISECONDS_PER_HOUR }, BOUNDS)).toEqual({
      fromMilliseconds: UNTIL - 15 * MILLISECONDS_PER_MINUTE,
      untilMilliseconds: UNTIL,
    });
    expect(clampWindow({ fromMilliseconds: BOUNDS.fromMilliseconds - MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL }, BOUNDS)).toEqual(BOUNDS);
  });

  it('moves a window lying wholly before or after the data to the edge it missed, never outside the data', () => {
    const dayBefore = {
      fromMilliseconds: BOUNDS.fromMilliseconds - 48 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: BOUNDS.fromMilliseconds - 24 * MILLISECONDS_PER_HOUR,
    };

    const dayAfter = { fromMilliseconds: UNTIL + 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL + 48 * MILLISECONDS_PER_HOUR };

    expect([clampWindow(dayBefore, BOUNDS), clampWindow(dayAfter, BOUNDS)]).toEqual([
      { fromMilliseconds: BOUNDS.fromMilliseconds, untilMilliseconds: BOUNDS.fromMilliseconds + 15 * MILLISECONDS_PER_MINUTE },
      { fromMilliseconds: UNTIL - 15 * MILLISECONDS_PER_MINUTE, untilMilliseconds: UNTIL },
    ]);
  });

  it('widens a short window that starts before the data into the data rather than out of it', () => {
    expect(
      clampWindow(
        { fromMilliseconds: BOUNDS.fromMilliseconds - MILLISECONDS_PER_HOUR, untilMilliseconds: BOUNDS.fromMilliseconds + 5 * MILLISECONDS_PER_MINUTE },
        BOUNDS,
      ),
    ).toEqual({ fromMilliseconds: BOUNDS.fromMilliseconds, untilMilliseconds: BOUNDS.fromMilliseconds + 15 * MILLISECONDS_PER_MINUTE });
  });
});

describe('dayShiftedWindow', () => {
  it('shifts a window in the middle of the data by exactly one day either way, keeping its length', () => {
    const window = { fromMilliseconds: UNTIL - 48 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR };

    const shifted = [dayShiftedWindow(window, SHIFT_DIRECTIONS.BACKWARD, BOUNDS), dayShiftedWindow(window, SHIFT_DIRECTIONS.FORWARD, BOUNDS)];

    expect(shifted).toEqual([
      { fromMilliseconds: UNTIL - 72 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL - 48 * MILLISECONDS_PER_HOUR },
      { fromMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL },
    ]);
  });

  it('shifting forward from the latest data leaves the window where it is', () => {
    const window = trailingWindow(UNTIL, 24 * MILLISECONDS_PER_HOUR);

    expect(dayShiftedWindow(window, SHIFT_DIRECTIONS.FORWARD, BOUNDS)).toEqual(window);
  });

  it('shifting back past the first reading stops on it at the same length', () => {
    const window = {
      fromMilliseconds: BOUNDS.fromMilliseconds + 2 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: BOUNDS.fromMilliseconds + 26 * MILLISECONDS_PER_HOUR,
    };

    const shifted = dayShiftedWindow(window, SHIFT_DIRECTIONS.BACKWARD, BOUNDS);

    expect(shifted).toEqual({ fromMilliseconds: BOUNDS.fromMilliseconds, untilMilliseconds: BOUNDS.fromMilliseconds + 24 * MILLISECONDS_PER_HOUR });
  });
});

describe('matchingPreset', () => {
  it('names a trailing window by the preset within two percent of its length', () => {
    expect(matchingPreset(trailingWindow(UNTIL, 24 * MILLISECONDS_PER_HOUR), UNTIL, STEP)?.key).toBe('last24Hours');
    expect(matchingPreset(trailingWindow(UNTIL, 7 * 24 * MILLISECONDS_PER_HOUR + 2 * MILLISECONDS_PER_HOUR), UNTIL, STEP)?.key).toBe('last7Days');
  });

  it('names nothing once the window stops ending at the latest data', () => {
    expect(matchingPreset(trailingWindow(UNTIL - 2 * STEP, 24 * MILLISECONDS_PER_HOUR), UNTIL, STEP)).toBeUndefined();
    expect(matchingPreset(trailingWindow(UNTIL, 20 * MILLISECONDS_PER_HOUR), UNTIL, STEP)).toBeUndefined();
  });
});

describe('instantAt', () => {
  it('maps a fraction of the plot onto the window', () => {
    expect(instantAt({ fromMilliseconds: 0, untilMilliseconds: 1000 }, 0.25)).toBe(250);
  });
});

describe('selectionExtentOf', () => {
  it('selectionExtentOf a drag made right to left starts where it ended', () => {
    const selection = { anchorFraction: 0.7, focusFraction: 0.2 };

    const extent = selectionExtentOf(selection);

    expect(extent).toEqual({ start: 0.2, end: 0.7 });
  });
});
