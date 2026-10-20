import { describe, expect, it } from 'vitest';
import { isPlaceable, readEntryOf, readMessageOf, readTimeOf, readTypeOf } from './log-reading';

const MAPPING = { timestamp: 'time', type: 'level', message: 'event.msg' };
const INSTANT = Date.parse('2026-08-29T10:24:00.000Z');

describe('readEntryOf', () => {
  it('readEntryOf, for an entry that holds all three fields, reads its time, its type and its message as written', () => {
    const record = { time: '2026-08-29T10:24:00.000Z', level: 'error', event: { msg: 'Upstream 503' } };

    expect(readEntryOf(record, MAPPING)).toEqual({ timeMilliseconds: INSTANT, type: 'error', message: 'Upstream 503' });
  });

  it('readEntryOf, for an entry missing them, reads no time, the unknown type and no message', () => {
    const reading = readEntryOf({ time: 'soon', level: null }, MAPPING);

    expect(reading).toEqual({ timeMilliseconds: null, type: 'unknown', message: undefined });
    expect(isPlaceable(reading)).toBe(false);
  });

  it('readEntryOf reads each role exactly as the reader of that role alone does', () => {
    const record = { time: INSTANT, level: 3, event: { msg: { code: 7 } } };

    expect(readEntryOf(record, MAPPING)).toEqual({
      timeMilliseconds: readTimeOf(record, MAPPING.timestamp),
      type: readTypeOf(record, MAPPING.type),
      message: readMessageOf(record, MAPPING.message),
    });
    expect(readTypeOf(record, MAPPING.type)).toBe('3');
  });
});
