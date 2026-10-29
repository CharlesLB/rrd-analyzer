import { MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { type LiveSession, minutesLeftOf, withoutSessionOf, withSessionReplaced } from './live-session';

const sessionOf = (analysisId: string, revision = 1): LiveSession => ({
  analysisId,
  sessionId: `session-of-${analysisId}`,
  link: `https://rrd-analyzer.example/app/#/shared/session-of-${analysisId}/key`,
  revision,
  expiresAtMilliseconds: 0,
  files: [],
  log: null,
});

describe('live session', () => {
  it.each([
    { name: 'a whole hour ahead', millisecondsLeft: 60 * MILLISECONDS_PER_MINUTE, minutes: 60 },
    { name: 'an hour ahead by a clock a few seconds behind the server', millisecondsLeft: 60 * MILLISECONDS_PER_MINUTE + 5000, minutes: 60 },
    { name: 'part of a minute ahead', millisecondsLeft: 1, minutes: 1 },
    { name: 'a minute and a half ahead', millisecondsLeft: 1.5 * MILLISECONDS_PER_MINUTE, minutes: 2 },
    { name: 'already past', millisecondsLeft: -MILLISECONDS_PER_MINUTE, minutes: 0 },
  ])('minutesLeftOf, for an expiry $name, counts the minutes started before it, never more than the hour a session lives', ({ millisecondsLeft, minutes }) => {
    const now = 1_000_000;

    expect(minutesLeftOf(now + millisecondsLeft, now)).toBe(minutes);
  });

  it('withSessionReplaced, for an analysis already live, keeps one session for it, the newer one', () => {
    const sessions = [sessionOf('a1'), sessionOf('a2')];

    const replaced = withSessionReplaced(sessions, sessionOf('a1', 2));

    expect(replaced).toEqual([sessionOf('a2'), sessionOf('a1', 2)]);
  });

  it('withSessionReplaced, for an analysis not live yet, adds its session', () => {
    expect(withSessionReplaced([sessionOf('a1')], sessionOf('a2'))).toEqual([sessionOf('a1'), sessionOf('a2')]);
  });

  it('withoutSessionOf drops the session of that analysis and keeps the others', () => {
    expect(withoutSessionOf([sessionOf('a1'), sessionOf('a2')], 'a1')).toEqual([sessionOf('a2')]);
  });
});
