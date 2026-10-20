import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { LogMapping } from '../log-mapping/log-mapping';
import { entriesOfTypesShown, rankedTypeCountsOf, shownPositionOf, steppedEntryOf, timelineOf } from './log-timeline';

const texts = messagesFor().logs;
const MAPPING: LogMapping = { timestamp: 'time', type: 'level', message: 'event.msg' };
const HOUR = Date.parse('2026-08-29T10:00:00.000Z');

const RECORDS = [
  { time: HOUR + 3000, level: 'info', event: { msg: 'third' } },
  { time: HOUR + 1000, level: 'error', event: { msg: 'first' } },
  { time: 'not a time', level: 'error', event: { msg: 'lost' } },
  { time: HOUR + 2000, event: { msg: { code: 7 } } },
  { time: HOUR + 4000, level: 'info', event: {} },
];

describe('timelineOf', () => {
  it('timelineOf, for entries out of order, sorts them by their time and numbers them in that order', () => {
    const { entries } = timelineOf(RECORDS, MAPPING, texts);

    expect(entries.map((entry) => [entry.index, entry.message])).toEqual([
      [0, 'first'],
      [1, '{"code":7}'],
      [2, 'third'],
      [3, '(no message)'],
    ]);
  });

  it('timelineOf, for an entry without a usable time, skips it and counts it', () => {
    expect(timelineOf(RECORDS, MAPPING, texts).skippedCount).toBe(1);
  });

  it('timelineOf, for an entry without a type, files it under unknown', () => {
    const { entries, types } = timelineOf(RECORDS, MAPPING, texts);

    expect(entries[1]?.type).toBe('unknown');
    expect(types).toEqual([
      { name: 'error', count: 1 },
      { name: 'info', count: 2 },
      { name: 'unknown', count: 1 },
    ]);
  });

  it('timelineOf, for each entry, keeps the original object untouched', () => {
    expect(timelineOf(RECORDS, MAPPING, texts).entries[0]?.record).toBe(RECORDS[1]);
  });

  it('timelineOf, over the placed entries, spans from the earliest to the latest, and spans nothing when none is placed', () => {
    expect(timelineOf(RECORDS, MAPPING, texts).span).toEqual({ fromMilliseconds: HOUR + 1000, untilMilliseconds: HOUR + 4000 });
    expect(timelineOf(RECORDS, { ...MAPPING, timestamp: 'level' }, texts).span).toBeNull();
  });
});

describe('rankedTypeCountsOf', () => {
  it('rankedTypeCountsOf, among types of the same rank, puts the most frequent first', () => {
    expect(rankedTypeCountsOf(['audit', 'billing', 'billing', 'warn'])).toEqual([
      { name: 'warn', count: 1 },
      { name: 'billing', count: 2 },
      { name: 'audit', count: 1 },
    ]);
  });
});

describe('steppedEntryOf', () => {
  const { entries } = timelineOf(RECORDS, MAPPING, texts);
  const withoutUnknown = entriesOfTypesShown(entries, new Set(['unknown']));

  it('shownPositionOf, for an entry on show, finds where it stands among the shown ones, and for a hidden one, where it would stand', () => {
    expect(shownPositionOf(entries, 2)).toEqual({ position: 2, isShown: true });
    expect(shownPositionOf(withoutUnknown, 2)).toEqual({ position: 1, isShown: true });
    expect(shownPositionOf(withoutUnknown, 1)).toEqual({ position: 1, isShown: false });
  });

  it('steppedEntryOf, stepping forward or back, lands on the neighbouring entry', () => {
    expect(steppedEntryOf(entries, shownPositionOf(entries, 1), 1)?.index).toBe(2);
    expect(steppedEntryOf(entries, shownPositionOf(entries, 1), -1)?.index).toBe(0);
  });

  it('steppedEntryOf, over entries of a hidden type, steps past them', () => {
    expect(steppedEntryOf(withoutUnknown, shownPositionOf(withoutUnknown, 0), 1)?.index).toBe(2);
    expect(entriesOfTypesShown(entries, new Set(['info'])).map((entry) => entry.index)).toEqual([0, 1]);
  });

  it('steppedEntryOf, from an entry whose type was hidden, lands on the shown entries either side of it', () => {
    expect(steppedEntryOf(withoutUnknown, shownPositionOf(withoutUnknown, 1), 1)?.index).toBe(2);
    expect(steppedEntryOf(withoutUnknown, shownPositionOf(withoutUnknown, 1), -1)?.index).toBe(0);
  });

  it('steppedEntryOf, at either end, has nowhere to go', () => {
    expect(steppedEntryOf(entries, shownPositionOf(entries, 3), 1)).toBeUndefined();
    expect(steppedEntryOf(entries, shownPositionOf(entries, 0), -1)).toBeUndefined();
  });
});
