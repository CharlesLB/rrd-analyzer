import { describe, expect, it } from 'vitest';
import { discoverLogFields } from '../log-field/log-field';
import { detectMapping, EMPTY_MAPPING, isSameMapping, withRoleMapped } from './log-mapping';

const recordsWith = (fields: (index: number) => Readonly<Record<string, unknown>>) => Array.from({ length: 10 }, (_unused, index) => fields(index));

const at = (index: number): string => new Date(Date.UTC(2026, 7, 29, 10, index)).toISOString();

describe('detectMapping', () => {
  it('detectMapping, for fields named unlike the usual ones, still finds the time, the type and the message', () => {
    const records = recordsWith((index) => ({
      '@timestamp': at(index),
      lvl: index % 2 === 0 ? 'error' : 'info',
      service: 'atlas-api',
      event: { msg: `Slow request ${index} exceeded the 300 ms budget`, code: `CODE_${index}` },
    }));

    expect(detectMapping(discoverLogFields(records))).toEqual({ timestamp: '@timestamp', type: 'lvl', message: 'event.msg' });
  });

  it('detectMapping, when two fields hold times, prefers the one named like a timestamp', () => {
    const records = recordsWith((index) => ({ started: at(index), time: at(index), level: 'info', message: 'ok' }));

    expect(detectMapping(discoverLogFields(records)).timestamp).toBe('time');
  });

  it('detectMapping, when a large plain number comes before the written time, takes the written time', () => {
    const records = recordsWith((index) => ({ id: 1_234_567_890 + index, at: at(index), level: 'info', message: 'ok' }));

    expect(detectMapping(discoverLogFields(records)).timestamp).toBe('at');
  });

  it('detectMapping, when a duration in nanoseconds is named like a time, still takes the written timestamp', () => {
    const records = recordsWith((index) => ({ response_time_ns: 1_500_000_000 + index, ts: at(index), level: 'info', message: 'ok' }));

    expect(detectMapping(discoverLogFields(records)).timestamp).toBe('ts');
  });

  it('detectMapping, when the only time is an epoch number, takes it', () => {
    const records = recordsWith((index) => ({ ts: 1_788_000_000 + index, level: 'info', message: 'ok' }));

    expect(detectMapping(discoverLogFields(records)).timestamp).toBe('ts');
  });

  it('detectMapping, for a text field with more than 24 distinct values, does not take it for the type', () => {
    const records = Array.from({ length: 30 }, (_unused, index) => ({ time: at(index), trace: `trace-${index}` }));

    expect(detectMapping(discoverLogFields(records)).type).toBe('');
  });

  it('detectMapping, when no field is mostly dates, leaves the timestamp unmapped', () => {
    const records = recordsWith((index) => ({ level: 'info', message: `entry ${index}` }));

    expect(detectMapping(discoverLogFields(records))).toEqual({ timestamp: '', type: 'level', message: 'message' });
  });

  it('detectMapping, between two text fields, takes the longer one as the message', () => {
    const records = recordsWith((index) => ({ time: at(index), level: 'info', host: 'atlas-01', body: `A much longer sentence about request ${index}` }));

    expect(detectMapping(discoverLogFields(records)).message).toBe('body');
  });
});

describe('withRoleMapped', () => {
  it('withRoleMapped, for one role, changes it and leaves the other two', () => {
    const mapping = withRoleMapped(EMPTY_MAPPING, 'type', 'lvl');

    expect(mapping).toEqual({ timestamp: '', type: 'lvl', message: '' });
    expect(isSameMapping(mapping, EMPTY_MAPPING)).toBe(false);
    expect(isSameMapping(mapping, { timestamp: '', type: 'lvl', message: '' })).toBe(true);
  });
});
