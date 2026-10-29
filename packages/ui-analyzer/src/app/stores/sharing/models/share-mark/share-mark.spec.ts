import { MILLISECONDS_PER_MINUTE, messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { LiveSession } from '../live-session/live-session';
import { SHARE_MARKS, shareMarkOf, shareMarkTextOf } from './share-mark';

const MARK_TEXTS = messagesFor().sharing.marks;

const NOW = 1_000_000;

const liveSessionOf = (analysisId: string): LiveSession => ({
  analysisId,
  sessionId: 'session-1',
  link: 'https://rrd-analyzer.example/app/#/shared/session-1/key',
  revision: 3,
  expiresAtMilliseconds: NOW + 42 * MILLISECONDS_PER_MINUTE,
  files: [],
  log: null,
});

describe('share mark', () => {
  it('shareMarkOf, for an analysis nobody shared, marks it local', () => {
    expect(shareMarkOf('a1', { sessionsByAnalysis: new Map(), followedAnalysisId: null, nowMilliseconds: NOW })).toEqual({ kind: SHARE_MARKS.LOCAL });
  });

  it('shareMarkOf, for an analysis this app shares live, marks it online with the minutes it has left', () => {
    const sessionsByAnalysis = new Map([['a1', liveSessionOf('a1')]]);

    expect(shareMarkOf('a1', { sessionsByAnalysis, followedAnalysisId: null, nowMilliseconds: NOW })).toEqual({ kind: SHARE_MARKS.ONLINE, minutesLeft: 42 });
  });

  it('shareMarkOf, for an analysis opened from a live link, marks it as followed', () => {
    expect(shareMarkOf('a2', { sessionsByAnalysis: new Map(), followedAnalysisId: 'a2', nowMilliseconds: NOW })).toEqual({ kind: SHARE_MARKS.FOLLOWING });
  });

  it.each([
    { name: 'kept on this device', mark: { kind: SHARE_MARKS.LOCAL }, text: { label: 'Local', tip: 'kept only on this device', isOnline: false } },
    {
      name: 'shared live',
      mark: { kind: SHARE_MARKS.ONLINE, minutesLeft: 42 },
      text: { label: 'Online · 42 min', tip: 'shared live; erased from the server 42 minutes after the last activity', isOnline: true },
    },
    {
      name: 'opened from a live link',
      mark: { kind: SHARE_MARKS.FOLLOWING },
      text: { label: 'Live link', tip: 'opened from a live link; erased from this tab when the session ends', isOnline: true },
    },
  ] as const)('shareMarkTextOf, for an analysis $name, names the mark and explains it', ({ mark, text }) => {
    expect(shareMarkTextOf(mark, MARK_TEXTS)).toEqual(text);
  });
});
