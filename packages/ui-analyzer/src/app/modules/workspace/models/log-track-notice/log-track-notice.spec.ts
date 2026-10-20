import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { type TrackSituation, trackNoticeOf } from './log-track-notice';

const texts = messagesFor().logs.track;
const DAY = 24 * 60 * 60 * 1000;
const BOUNDS = { fromMilliseconds: new Date(2026, 7, 1).getTime(), untilMilliseconds: new Date(2026, 7, 30).getTime() };

const situationOf = (changes: Partial<TrackSituation>): TrackSituation => ({
  status: 'ready',
  fileName: 'atlas-api-logs.json',
  failureTitle: '',
  recordCount: 812,
  isSetupOpen: false,
  shownTypeCount: 5,
  inViewCount: 33,
  span: { fromMilliseconds: BOUNDS.fromMilliseconds + DAY, untilMilliseconds: BOUNDS.untilMilliseconds - DAY },
  bounds: BOUNDS,
  ...changes,
});

describe('trackNoticeOf', () => {
  it('trackNoticeOf, with entries in view, has nothing to say', () => {
    expect(trackNoticeOf(situationOf({}), texts)).toBeNull();
  });

  it('trackNoticeOf, while the file is read, says it is parsing it', () => {
    expect(trackNoticeOf(situationOf({ status: 'loading' }), texts)?.text).toBe('Parsing atlas-api-logs.json…');
  });

  it('trackNoticeOf, for a file that failed, says why in the failure colour and offers the details', () => {
    expect(
      trackNoticeOf(situationOf({ status: 'failed', fileName: 'broken-export.json', failureTitle: "This file isn't valid JSON near line 2." }), texts),
    ).toEqual({
      text: "Couldn't load broken-export.json — This file isn't valid JSON near line 2.",
      detail: '',
      action: { kind: 'open-setup', label: 'Details' },
      isFailure: true,
    });
  });

  it('trackNoticeOf, before the fields are mapped, asks for the mapping and offers the setup unless it is already open', () => {
    const closed = trackNoticeOf(situationOf({ status: 'setup' }), texts);

    expect(closed?.text).toBe('Map the timestamp, type and message fields to place 812 entries on the timeline.');
    expect(closed?.action).toEqual({ kind: 'open-setup', label: 'Open setup' });
    expect(trackNoticeOf(situationOf({ status: 'setup', isSetupOpen: true }), texts)?.action).toBeNull();
  });

  it('trackNoticeOf, with every type hidden, offers to show them all', () => {
    expect(trackNoticeOf(situationOf({ shownTypeCount: 0, inViewCount: 0 }), texts)).toMatchObject({
      text: 'All log types are hidden.',
      action: { kind: 'show-all-types', label: 'Show all' },
    });
  });

  it('trackNoticeOf, with no entry in the window, says where the logs are and offers to jump there', () => {
    expect(trackNoticeOf(situationOf({ inViewCount: 0 }), texts)).toEqual({
      text: 'No log entries in this window.',
      detail: 'Logs span 2026-08-02 00:00 → 2026-08-29 00:00',
      action: { kind: 'jump-to-logs', label: 'Jump to logs' },
      isFailure: false,
    });
  });

  it('trackNoticeOf, for logs wholly outside the RRD data, says so and offers no jump', () => {
    const span = { fromMilliseconds: BOUNDS.untilMilliseconds + DAY, untilMilliseconds: BOUNDS.untilMilliseconds + 2 * DAY };

    expect(trackNoticeOf(situationOf({ inViewCount: 0, span }), texts)).toMatchObject({ text: 'These logs fall outside the RRD data range.', action: null });
  });
});
