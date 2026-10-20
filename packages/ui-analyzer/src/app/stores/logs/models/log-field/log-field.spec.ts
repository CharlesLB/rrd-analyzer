import { describe, expect, it } from 'vitest';
import { discoverLogFields, valueAtPath } from './log-field';

describe('valueAtPath', () => {
  it('valueAtPath, for a dotted path, walks into the nested objects', () => {
    expect(valueAtPath({ event: { msg: 'slow' } }, 'event.msg')).toBe('slow');
  });

  it('valueAtPath, for a key that itself holds a dot, prefers the key', () => {
    expect(valueAtPath({ 'event.msg': 'flat', event: { msg: 'nested' } }, 'event.msg')).toBe('flat');
  });

  it('valueAtPath, for a nested key that itself holds dots, reads the path the fields were listed under', () => {
    const record = { labels: { 'app.kubernetes.io/name': 'atlas', tier: 'web' } };
    const [dotted] = discoverLogFields([record]).fields;

    expect(dotted?.path).toBe('labels.app.kubernetes.io/name');
    expect(valueAtPath(record, dotted?.path ?? '')).toBe('atlas');
    expect(valueAtPath(record, 'labels.tier')).toBe('web');
  });

  it('valueAtPath, for a path that leads nowhere, finds nothing', () => {
    expect(valueAtPath({ event: 'text' }, 'event.msg')).toBeUndefined();
    expect(valueAtPath({ event: {} }, 'event.toString')).toBeUndefined();
    expect(valueAtPath({ event: {} }, '')).toBeUndefined();
  });
});

describe('discoverLogFields', () => {
  it('discoverLogFields, for nested objects, flattens them into dotted paths and keeps an array as one value', () => {
    const { fields, sampledCount } = discoverLogFields([
      { '@timestamp': '2026-08-29T10:24:00.000Z', lvl: 'error', event: { msg: 'Upstream 503', code: 'UPSTREAM_503' }, tags: ['a', 'b'] },
      { '@timestamp': '2026-08-29T10:25:00.000Z', lvl: 'info', event: { msg: 'Health check passed', code: 'HEALTH_OK' } },
    ]);

    expect(sampledCount).toBe(2);
    expect(fields.map((field) => field.path)).toEqual(['@timestamp', 'lvl', 'event.msg', 'event.code', 'tags']);
  });

  it('discoverLogFields, for each field, counts where it is present, where it is text and where it is a time', () => {
    const { fields } = discoverLogFields([
      { time: '2026-08-29T10:24:00.000Z', level: 'error' },
      { time: '2026-08-29T10:25:00.000Z', level: 'error' },
      { time: 'soon', level: 'info' },
    ]);

    const [time, level] = fields;

    expect(time).toMatchObject({ presentCount: 3, textCount: 3, timestampCount: 2, writtenDateCount: 2, sample: '2026-08-29T10:24:00.000Z' });
    expect(level).toMatchObject({ presentCount: 3, distinctValues: ['error', 'info'], textLength: 14 });
  });

  it('discoverLogFields, past the fourth level, stops flattening and keeps the object as one value', () => {
    const { fields } = discoverLogFields([{ a: { b: { c: { d: { e: { f: 1 } } } } } }]);

    expect(fields.map((field) => field.path)).toEqual(['a.b.c.d.e']);
  });

  it('discoverLogFields, for a very long file, samples only the first 400 entries', () => {
    const records = Array.from({ length: 450 }, (_unused, index) => (index < 400 ? { early: index } : { late: index }));
    const { fields, sampledCount } = discoverLogFields(records);

    expect(sampledCount).toBe(400);
    expect(fields.map((field) => field.path)).toEqual(['early']);
  });
});
