import { TestBed } from '@angular/core/testing';
import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHIFT_DIRECTIONS } from '../../../workspace/models/timeframe/timeframe';
import { TimeWindowStore } from './time-window.store';

const UNTIL = 1_788_026_400_000;
const BOUNDS = { fromMilliseconds: UNTIL - 30 * 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL };

describe('TimeWindowStore', () => {
  let store: TimeWindowStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TimeWindowStore] });
    store = TestBed.inject(TimeWindowStore);
    store.initialize(BOUNDS, 5 * MILLISECONDS_PER_MINUTE);
  });

  it('opens on the last 24 hours of data, named by its preset with its step', () => {
    expect(store.window()).toEqual({ fromMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL });
    expect(store.timeframeLabel()).toBe('Last 24 hours');
    expect(store.durationAndStep()).toBe('24 h · step 6 min');
    expect(store.hasZoomHistory()).toBe(false);
  });

  it('openedWindow, once the data has bounds, is the window on screen', () => {
    const opened = store.openedWindow();

    expect(opened).toEqual(store.window());
  });

  it('clear leaves no window to name, so the bar shows no timeframe rather than one dated 1970', () => {
    store.clear();

    expect(store.hasWindow()).toBe(false);
    expect(store.openedWindow()).toBeNull();
    expect(store.timeframeLabel()).toBe('');
    expect(store.durationAndStep()).toBe('');
  });

  it('labels a window that no preset matches by its two ends', () => {
    store.setWindow({ fromMilliseconds: UNTIL - 30 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL - 20 * MILLISECONDS_PER_HOUR });

    expect(store.timeframeLabel()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} to \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(store.hasZoomHistory()).toBe(true);
  });

  it('steps back through the zoom history, and out to all the data once it is empty', () => {
    store.setWindow({ fromMilliseconds: UNTIL - 6 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL });
    store.zoomBack();

    expect(store.window()).toEqual({ fromMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL });

    store.zoomBack();

    expect(store.window()).toEqual(BOUNDS);
  });

  it('shifts by a whole day and records where it was, so the undo restores it', () => {
    store.shiftDay(SHIFT_DIRECTIONS.BACKWARD);

    expect(store.window()).toEqual({ fromMilliseconds: UNTIL - 48 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR });
    expect(store.hasZoomHistory()).toBe(true);

    store.zoomBack();

    expect(store.window()).toEqual({ fromMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL });
  });

  it('names the shift each arrow would make, and says so instead when it is already at that end of the data', () => {
    expect(store.forwardShift().isAvailable).toBe(false);
    expect(store.forwardShift().title).toBe('End of data');
    expect(store.forwardShift().detail).toMatch(/^Files end \d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(store.backShift().title).toBe('Back 1 day');
    expect(store.backShift().detail).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2} {2}→ {2}\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it('an arrow at the end of the data does nothing, so no window lands on the undo stack', () => {
    store.shiftDay(SHIFT_DIRECTIONS.FORWARD);

    expect(store.window()).toEqual({ fromMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL });
    expect(store.hasZoomHistory()).toBe(false);
  });

  it('shows the last N units, and leaves the window alone for a count that is not a whole number of one or more', () => {
    expect(store.showTrailingCount('6', 'hours')).toBe(true);
    expect(store.timeframeLabel()).toBe('Last 6 hours');

    expect(store.showTrailingCount('abc', 'days')).toBe(false);
    expect(store.showTrailingCount('0', 'days')).toBe(false);
    expect(store.timeframeLabel()).toBe('Last 6 hours');
  });

  it('applies an absolute window only when both ends read and To comes after From', () => {
    expect(store.showAbsolute('2026-08-28', '2026-08-29 10:00')).toBe('refused');
    expect(store.showAbsolute('2026-08-28 10:00', '2026-08-28 09:00')).toBe('refused');
    expect(store.timeframeLabel()).toBe('Last 24 hours');

    expect(store.showAbsolute('2026-08-28 10:00', '2026-08-28 16:00')).toBe('applied');
    expect(store.window()).toEqual({ fromMilliseconds: new Date(2026, 7, 28, 10, 0).getTime(), untilMilliseconds: new Date(2026, 7, 28, 16, 0).getTime() });
  });

  it('says so when an absolute window had to be fitted to the data, whether trimmed at an end or widened to the shortest window', () => {
    expect(store.showAbsolute('2026-01-01 00:00', '2026-08-28 16:00')).toBe('adjusted');
    expect(store.window().untilMilliseconds).toBe(new Date(2026, 7, 28, 16, 0).getTime());
    expect(store.showAbsolute('2026-08-28 10:00', '2026-08-28 10:05')).toBe('adjusted');
    expect(store.window().untilMilliseconds).toBe(new Date(2026, 7, 28, 10, 15).getTime());
  });

  it('shares one cursor across charts and follows the pointer', () => {
    store.pointAt(0.4, null);

    expect(store.cursor()).toEqual({ fraction: 0.4, chartId: null });

    store.leavePlot();

    expect(store.cursor()).toBeNull();
  });

  it('pointAt the column the cursor is already on keeps the same cursor, so no chart redraws for a vertical move', () => {
    store.pointAt(0.4, null);
    const cursor = store.cursor();

    store.pointAt(0.4, null);

    expect(store.cursor()).toBe(cursor);
  });

  it('pins the cursor to the chart entered when the crosshair is not synchronised', () => {
    store.pointAt(0.3, null);
    store.enterChart('s2', false);

    expect(store.cursor()).toEqual({ fraction: 0.3, chartId: 's2' });

    store.enterChart('s4', true);

    expect(store.cursor()?.chartId).toBe('s2');
  });

  it('keeps the cursor on the chart still pointed at after a drag zoomed into it, though the zoom cleared the pointer', () => {
    store.enterChart('s2', false);
    store.beginSelection(0.25);
    store.pointAt(0.75, 's2');
    store.finishSelection();

    expect(store.cursor()).toBeNull();

    store.pointAt(0.5, 's2');

    expect(store.cursor()).toEqual({ fraction: 0.5, chartId: 's2' });
  });

  it('zooms into a drag wider than 1.2% of the plot and remembers the window it left', () => {
    store.beginSelection(0.25);
    store.pointAt(0.75, null);
    store.finishSelection();

    expect(store.window()).toEqual({ fromMilliseconds: UNTIL - 18 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL - 6 * MILLISECONDS_PER_HOUR });
    expect(store.selection()).toBeNull();
    expect(store.hasZoomHistory()).toBe(true);
  });

  it('treats a drag of 1.2% or less as a click and leaves the window alone', () => {
    store.beginSelection(0.5);
    store.pointAt(0.51, null);
    store.finishSelection();

    expect(store.window()).toEqual({ fromMilliseconds: UNTIL - 24 * MILLISECONDS_PER_HOUR, untilMilliseconds: UNTIL });
    expect(store.selection()).toBeNull();
  });

  it('a press on the strip that never moves leaves nothing to zoom back to', () => {
    const opened = store.window();

    store.setWindow(opened);
    store.setWindow(opened);

    expect(store.hasZoomHistory()).toBe(false);
  });

  it('a slide shows at once and is queried only once it rests, while any other change is queried at once', () => {
    vi.useFakeTimers();
    const opened = store.window();
    const slid = { fromMilliseconds: opened.fromMilliseconds - MILLISECONDS_PER_HOUR, untilMilliseconds: opened.untilMilliseconds - MILLISECONDS_PER_HOUR };

    store.setWindow(opened);
    store.slideWindow(slid);

    expect(store.window()).toEqual(slid);
    expect(store.queriedWindow()).toEqual(opened);

    vi.advanceTimersByTime(150);

    expect(store.queriedWindow()).toEqual(slid);
    expect(store.hasZoomHistory()).toBe(true);

    store.zoomBack();

    expect(store.queriedWindow()).toEqual(opened);
    vi.useRealTimers();
  });

  it('a cancelled selection zooms nowhere when the pointer is released', () => {
    const before = store.window();

    store.beginSelection(0.2);
    store.pointAt(0.6, 's0');
    store.cancelSelection();
    store.finishSelection();

    expect(store.selection()).toBeNull();
    expect(store.window()).toBe(before);
  });
});
