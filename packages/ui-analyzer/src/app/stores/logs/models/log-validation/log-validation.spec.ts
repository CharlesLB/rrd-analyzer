import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { LogMapping } from '../log-mapping/log-mapping';
import { timelineOf } from '../log-timeline/log-timeline';
import { truncated, type ValidationTexts, validateMapping } from './log-validation';

const messages = messagesFor();
const texts: ValidationTexts = { logs: messages.logs, units: messages.units, listSeparator: messages.application.listSeparator };
const MAPPING: LogMapping = { timestamp: 'time', type: 'level', message: 'message' };
const START = new Date(2026, 6, 30, 15, 10, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

const RECORDS = [
  { time: START, level: 'warn', message: 'Slow request exceeded 300 ms budget', trace: 'a1' },
  { time: START + DAY, level: 'error', message: 'Upstream 503', trace: 'b2' },
  { time: START + 30 * DAY, level: 'info', message: 'Health check passed', trace: 'c3' },
];

describe('validateMapping', () => {
  it('validateMapping, when all three fields fit, shows an example of each and lets the logs through', () => {
    const validation = validateMapping(RECORDS, MAPPING, texts);

    expect(validation.roles.timestamp).toEqual({ state: 'ok', note: 'e.g. 2026-07-30 15:10:00 · spans 30 d' });
    expect(validation.roles.type).toEqual({ state: 'ok', note: '3 types: error, warn, info' });
    expect(validation.roles.message).toEqual({ state: 'ok', note: '“Slow request exceeded 300 ms budget”' });
    expect(validation.isValid).toBe(true);
    expect(validation.hasWarning).toBe(false);
    expect(validation.types.map((type) => type.name)).toEqual(['error', 'warn', 'info']);
  });

  it('validateMapping, with a role left unmapped, asks for it and blocks', () => {
    const validation = validateMapping(RECORDS, { timestamp: '', type: '', message: '' }, texts);

    expect(validation.roles.timestamp.note).toBe("Required — pick the field with each entry's date and time.");
    expect(validation.roles.type.note).toBe('Required — pick the level or category field.');
    expect(validation.roles.message.note).toBe('Required — pick the main message field.');
    expect(validation.isValid).toBe(false);
  });

  it('validateMapping, for a timestamp field with no dates, blocks, and with only some dates, warns how many entries are skipped', () => {
    const partial = [...RECORDS, { time: 'later', level: 'info', message: 'x' }];

    expect(validateMapping(RECORDS, { ...MAPPING, timestamp: 'trace' }, texts).roles.timestamp).toEqual({
      state: 'error',
      note: '“trace” holds no dates or epoch times. Pick another field.',
    });
    expect(validateMapping(partial, MAPPING, texts).roles.timestamp).toEqual({
      state: 'warning',
      note: '1 of 4 entries have no usable time and will be skipped.',
    });
    expect(validateMapping(partial, MAPPING, texts).hasWarning).toBe(true);
  });

  it('validateMapping, for entries that will be skipped for want of a time, counts the types as the timeline will place them', () => {
    const partial = [...RECORDS, { time: 'later', level: 'fatal', message: 'x' }, { time: 'later', level: 'info', message: 'y' }];
    const validation = validateMapping(partial, MAPPING, texts);

    expect(validation.types).toEqual(timelineOf(partial, MAPPING, texts.logs).types);
    expect(validation.types.map((type) => type.name)).not.toContain('fatal');
  });

  it('validateMapping, for a type field with more than 24 distinct values, takes it for an identifier and blocks', () => {
    const records = Array.from({ length: 180 }, (_unused, index) => ({ time: START + index, level: `id-${index}`, message: 'x' }));
    const validation = validateMapping(records, MAPPING, texts);

    expect(validation.roles.type).toEqual({ state: 'error', note: '“level” has 180 distinct values — that looks like an ID, not a log type.' });
    expect(validation.types).toEqual([]);
  });

  it('validateMapping, for a type already used as the timestamp or empty everywhere, blocks', () => {
    expect(validateMapping(RECORDS, { ...MAPPING, type: 'time' }, texts).roles.type.note).toBe('Already used for Timestamp.');
    expect(validateMapping(RECORDS, { ...MAPPING, type: 'absent' }, texts).roles.type.note).toBe('No entry has a value in “absent”.');
  });

  it('validateMapping, for entries missing a type or a message, warns how they will be shown', () => {
    const records = [...RECORDS, { time: START, trace: 'd4' }];
    const validation = validateMapping(records, MAPPING, texts);

    expect(validation.roles.type).toEqual({ state: 'warning', note: '1 entry has no type — shown as “unknown”.' });
    expect(validation.roles.message).toEqual({ state: 'warning', note: '1 entry has no message — shown as “(no message)”.' });
    expect(validation.isValid).toBe(true);
  });

  it('validateMapping, for a message mapped to a field another role holds, blocks', () => {
    expect(validateMapping(RECORDS, { ...MAPPING, message: 'level' }, texts).roles.message).toEqual({
      state: 'error',
      note: 'Already mapped to another role.',
    });
  });
});

describe('truncated', () => {
  it('truncated, for a text past the length, cuts it and ends with an ellipsis', () => {
    expect(truncated('abcdef', 4)).toBe('abc…');
    expect(truncated('abc', 4)).toBe('abc');
  });
});
