import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LiveSessionBannerComponent } from './live-session-banner.component';

describe('LiveSessionBannerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('says the analysis follows a live session, that local changes are replaced, and when it is erased', () => {
    const fixture = renderWithInputs(LiveSessionBannerComponent, { minutesLeft: 12 });

    expect(textOf(fixture, '.live-session-banner-label')).toBe('Live session');
    expect(textOf(fixture, '.live-session-banner-detail')).toBe('Following the changes of whoever shared it. Changes made here are replaced by theirs.');
    expect(textOf(fixture, '.live-session-banner-expiry')).toBe('erased 12 minutes after the last activity');
  });

  it('with a minute left, speaks of one minute', () => {
    expect(textOf(renderWithInputs(LiveSessionBannerComponent, { minutesLeft: 1 }), '.live-session-banner-expiry')).toBe(
      'erased 1 minute after the last activity',
    );
  });
});
