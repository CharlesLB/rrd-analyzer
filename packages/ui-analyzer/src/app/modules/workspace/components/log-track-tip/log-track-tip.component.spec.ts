import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOG_TYPE_COLORS } from '../../../../shared/constants/colors';
import { cssColorOf, elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogTrackTipComponent, type TrackTip } from './log-track-tip.component';

const tipOf = (changes: Partial<TrackTip> = {}): TrackTip => ({
  left: '50.00%',
  shift: 'translateX(-50.00%)',
  color: LOG_TYPE_COLORS.error,
  type: 'error',
  time: '2026-08-29 07:24:00',
  message: 'Upstream 503 from atlas-store',
  more: '',
  ...changes,
});

describe('LogTrackTipComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the type in its colour, the time to the second and the message, where the marker is', () => {
    const fixture = renderWithInputs(LogTrackTipComponent, { tip: tipOf() });

    expect(textOf(fixture, '.log-track-tip-type')).toBe('error');
    expect(textOf(fixture, '.log-track-tip-time')).toBe('2026-08-29 07:24:00');
    expect(textOf(fixture, '.log-track-tip-message')).toBe('Upstream 503 from atlas-store');
    expect(elementOf(fixture, '.log-track-tip-dot')?.style.background).toBe(cssColorOf(LOG_TYPE_COLORS.error));
    expect(elementOf(fixture, '.log-track-tip')?.style.left).toBe('50%');
    expect(elementOf(fixture, '.log-track-tip-more')).toBeNull();
  });

  it('for a marker that groups several entries, says how many more are there', () => {
    const fixture = renderWithInputs(LogTrackTipComponent, { tip: tipOf({ more: '+4 more here · click, then step with ‹ ›' }) });

    expect(textOf(fixture, '.log-track-tip-more')).toBe('+4 more here · click, then step with ‹ ›');
  });

  it('is slid back by the share of its width it was given, which is what keeps it on the track', () => {
    const fixture = renderWithInputs(LogTrackTipComponent, { tip: tipOf({ left: '15.00%', shift: 'translateX(-15.00%)' }) });

    expect(elementOf(fixture, '.log-track-tip')?.style.transform).toBe('translateX(-15.00%)');
  });
});
