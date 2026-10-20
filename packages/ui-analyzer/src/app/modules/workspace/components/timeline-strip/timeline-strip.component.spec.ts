import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { countOf, elementOf, elementsOf, renderWithInputs, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { CanvasOverview } from '../../../../stores/workspace/models/series/series.model';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';
import { TimelineStripComponent } from './timeline-strip.component';

const BOUNDS: TimeRange = { fromMilliseconds: new Date(2026, 6, 30, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };
const WINDOW: TimeRange = { fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };
const OVERVIEW: CanvasOverview = { samples: [10, 20, 15], color: SERIES_COLORS[0] };
const TRACK_BOX = { left: 100, width: 200 } as const;

const renderStrip = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(TimelineStripComponent, {
    bounds: BOUNDS,
    window: WINDOW,
    stepMilliseconds: 300_000,
    overview: OVERVIEW,
    ...overrides,
  });

type Fixture = ReturnType<typeof renderStrip>;

const stubbedTrack = (fixture: Fixture): HTMLElement => {
  const track = elementOf(fixture, '.timeline-strip-track');

  if (track === null) {
    throw new Error('the strip has no track');
  }

  track.getBoundingClientRect = () => ({ ...TRACK_BOX, right: 0, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => '' });
  track.setPointerCapture = () => undefined;

  return track;
};

const pressAt = (element: HTMLElement, clientX: number): void => {
  element.dispatchEvent(new PointerEvent('pointerdown', { clientX, bubbles: true }));
};

describe('TimelineStripComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('marks the file range with six dated ticks and places the window over its share of it', () => {
    const fixture = renderStrip();

    expect(textsOf(fixture, '.timeline-strip-tick-label')).toEqual(['30 Jul', '5 Aug', '11 Aug', '17 Aug', '23 Aug', '29 Aug']);
    expect(countOf(fixture, '.timeline-strip-tick')).toBe(6);
    expect(elementOf(fixture, '.timeline-strip-window')?.style.left).toBe('96.67%');
    expect(elementOf(fixture, '.timeline-strip-window')?.style.width).toBe('3.33%');
  });

  it('a window too narrow to hold its handles wears them outside its edges, and a wide one keeps them on the edges', () => {
    const hour: TimeRange = { fromMilliseconds: WINDOW.fromMilliseconds, untilMilliseconds: WINDOW.fromMilliseconds + 3_600_000 };

    expect(countOf(renderStrip({ window: hour }), '.timeline-strip-handle-outside')).toBe(2);
    expect(countOf(renderStrip(), '.timeline-strip-handle-outside')).toBe(0);
  });

  it('draws the overview in the colour of the chart it follows, and nothing at all on an empty canvas', () => {
    expect(elementOf(renderStrip(), '.timeline-overview-line')?.getAttribute('stroke')).toBe(SERIES_COLORS[0]);
    expect(elementOf(renderStrip({ overview: null }), '.timeline-overview')).toBeNull();
  });

  it('pressing the empty track centres the window there and remembers where it was', () => {
    const fixture = renderStrip();
    const started = vi.fn();

    fixture.componentInstance.gestureStarted.subscribe(started);
    pressAt(stubbedTrack(fixture), 200);

    expect(started).toHaveBeenCalledWith({
      fromMilliseconds: new Date(2026, 7, 14, 3, 0).getTime(),
      untilMilliseconds: new Date(2026, 7, 15, 3, 0).getTime(),
    });
  });

  it('a press of any button but the primary one moves nothing and starts no gesture', () => {
    const fixture = renderStrip();
    const track = stubbedTrack(fixture);
    const started = vi.fn();

    fixture.componentInstance.gestureStarted.subscribe(started);
    track.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, button: 2, bubbles: true }));
    elementOf(fixture, '.timeline-strip-window')?.dispatchEvent(new PointerEvent('pointerdown', { clientX: 290, button: 1, bubbles: true }));

    expect(started).not.toHaveBeenCalled();
  });

  it('dragging the window body slides it without remembering a second window', () => {
    const fixture = renderStrip();
    const started = vi.fn();
    const slid = vi.fn();
    const track = stubbedTrack(fixture);

    fixture.componentInstance.gestureStarted.subscribe(started);
    fixture.componentInstance.windowSlid.subscribe(slid);
    pressAt(elementsOf(fixture, '.timeline-strip-window')[0] ?? track, 280);
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 240 }));

    expect(started).toHaveBeenCalledWith(WINDOW);
    expect(slid).toHaveBeenCalledWith({
      fromMilliseconds: WINDOW.fromMilliseconds - 6 * 24 * 3_600_000,
      untilMilliseconds: WINDOW.untilMilliseconds - 6 * 24 * 3_600_000,
    });
  });

  it('a move with no gesture under way slides nothing', () => {
    const fixture = renderStrip();
    const slid = vi.fn();

    fixture.componentInstance.windowSlid.subscribe(slid);
    stubbedTrack(fixture).dispatchEvent(new PointerEvent('pointermove', { clientX: 240 }));

    expect(slid).not.toHaveBeenCalled();
  });

  it('releasing the pointer ends the gesture, so the next move slides nothing', () => {
    const fixture = renderStrip();
    const slid = vi.fn();
    const track = stubbedTrack(fixture);

    fixture.componentInstance.windowSlid.subscribe(slid);
    pressAt(track, 200);
    track.dispatchEvent(new PointerEvent('pointerup'));
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 240 }));

    expect(slid).not.toHaveBeenCalled();
  });

  it('a press that starts a gesture cancels the browser default, so no text selection or native drag of the handle begins', () => {
    const fixture = renderStrip();
    stubbedTrack(fixture);
    const press = new PointerEvent('pointerdown', { clientX: 280, bubbles: true, cancelable: true });

    elementsOf(fixture, '.timeline-strip-handle')[0]?.dispatchEvent(press);

    expect(press.defaultPrevented).toBe(true);
  });

  it('losing the pointer capture ends the gesture, so the next move slides nothing', () => {
    const fixture = renderStrip();
    const slid = vi.fn();
    const track = stubbedTrack(fixture);

    fixture.componentInstance.windowSlid.subscribe(slid);
    pressAt(track, 200);
    track.dispatchEvent(new PointerEvent('lostpointercapture'));
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 240 }));

    expect(slid).not.toHaveBeenCalled();
  });

  it('offers the window and its two ends as sliders a keyboard can reach, each saying where it stands', () => {
    const sliders = elementsOf(renderStrip(), '[role="slider"]');

    expect(sliders.map((slider) => slider.getAttribute('aria-label'))).toEqual([
      'the window on the timeline, arrow keys slide it',
      'start of the window, arrow keys move it',
      'end of the window, arrow keys move it',
    ]);
    expect(sliders.map((slider) => slider.getAttribute('aria-valuetext'))).toEqual([
      '2026-08-28 15:00 to 2026-08-29 15:00',
      '2026-08-28 15:00',
      '2026-08-29 15:00',
    ]);
    expect(sliders.map((slider) => slider.tabIndex)).toEqual([0, 0, 0]);
  });

  it('an arrow key on a handle moves that end, remembering the window once for a run of presses', () => {
    const fixture = renderStrip();
    const started = vi.fn();
    const slid = vi.fn();
    fixture.componentInstance.gestureStarted.subscribe(started);
    fixture.componentInstance.windowSlid.subscribe(slid);
    const start = elementsOf(fixture, '.timeline-strip-handle')[0];

    start?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    start?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));

    expect(started).toHaveBeenCalledTimes(1);
    expect(slid).toHaveBeenLastCalledWith({ fromMilliseconds: WINDOW.fromMilliseconds - 216 * 60_000 + 60_000, untilMilliseconds: WINDOW.untilMilliseconds });

    start?.dispatchEvent(new FocusEvent('blur'));
    start?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(started).toHaveBeenCalledTimes(2);
  });

  it('a cancelled drag puts the window back where the press found it and ends the gesture', () => {
    const fixture = renderStrip();
    const slid = vi.fn();
    const track = stubbedTrack(fixture);
    fixture.componentInstance.windowSlid.subscribe(slid);

    pressAt(track, 200);
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 240 }));
    fixture.componentInstance.cancelGesture();
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 120 }));

    expect(fixture.componentInstance.isHeld()).toBe(false);
    expect(slid).toHaveBeenLastCalledWith(WINDOW);
    expect(slid).toHaveBeenCalledTimes(2);
  });
});
