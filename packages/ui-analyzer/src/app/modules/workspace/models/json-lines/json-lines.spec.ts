import { describe, expect, it } from 'vitest';
import { jsonLinesOf } from './json-lines';

const RECORD = { '@timestamp': '2026-08-29T10:24:00.000Z', event: { code: 503, retried: true, user: null }, tags: ['a', 'b'], empty: {}, none: [] };

describe('jsonLinesOf', () => {
  it('jsonLinesOf, for any object, writes the same text as a two-space pretty print, in the same field order', () => {
    expect(
      jsonLinesOf(RECORD)
        .map((line) => line.text)
        .join('\n'),
    ).toBe(JSON.stringify(RECORD, null, 2));
  });

  it('jsonLinesOf, for a line holding a key and a value, marks where each token starts and ends', () => {
    const [, timestamp] = jsonLinesOf(RECORD);

    expect(timestamp?.text).toBe('  "@timestamp": "2026-08-29T10:24:00.000Z",');
    expect(timestamp?.tokens).toEqual([
      { start: 2, end: 14, kind: 'key' },
      { start: 14, end: 16, kind: 'punctuation' },
      { start: 16, end: 42, kind: 'string' },
      { start: 42, end: 43, kind: 'punctuation' },
    ]);
  });

  it('jsonLinesOf, for numbers, booleans and null, tells them apart', () => {
    const kinds = jsonLinesOf(RECORD)
      .slice(3, 6)
      .map((line) => line.tokens[2]?.kind);

    expect(kinds).toEqual(['number', 'boolean', 'null']);
  });

  it('jsonLinesOf, for a text holding quotes and line breaks, keeps it escaped on one line', () => {
    expect(jsonLinesOf({ message: 'said "no"\nthen left' }).map((line) => line.text)).toEqual(['{', '  "message": "said \\"no\\"\\nthen left"', '}']);
  });

  it('jsonLinesOf, for a value that is not an object, writes it on a single line', () => {
    expect(jsonLinesOf('plain')).toEqual([{ text: '"plain"', tokens: [{ start: 0, end: 7, kind: 'string' }] }]);
  });
});
