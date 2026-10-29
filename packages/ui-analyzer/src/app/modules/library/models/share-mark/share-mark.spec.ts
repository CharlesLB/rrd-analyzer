import { MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { LiveSession } from '../../../../stores/sharing/models/live-session/live-session';
import { SHARE_MARKS, shareMarkOf } from './share-mark';

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
});
