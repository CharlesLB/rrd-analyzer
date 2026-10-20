import { describe, expect, it } from 'vitest';
import { jsonLinesOf } from '../json-lines/json-lines';
import { searchedLinesOf, searchMatchesOf, wrappedMatchIndex } from './json-search';

const LINES = jsonLinesOf({ service: 'atlas-api', host: 'atlas-prod-02', event: { msg: 'Upstream 503 from atlas-store, Atlas retried' } });

describe('searchMatchesOf', () => {
  it('searchMatchesOf, whatever the case, finds every occurrence, several on a line', () => {
    expect(searchMatchesOf(LINES, 'ATLAS')).toEqual([
      { lineIndex: 1, start: 14, end: 19 },
      { lineIndex: 2, start: 11, end: 16 },
      { lineIndex: 4, start: 30, end: 35 },
      { lineIndex: 4, start: 43, end: 48 },
    ]);
  });

  it('searchMatchesOf, after a letter whose lower case is longer than itself, still marks the match where it is written', () => {
    const line = { text: '"city": "İzmir atlas"', tokens: [] };

    expect(searchMatchesOf([line], 'Atlas')).toEqual([{ lineIndex: 0, start: 15, end: 20 }]);
  });

  it('searchMatchesOf, for keys and punctuation, searches them as it does values', () => {
    expect(searchMatchesOf(LINES, '"host": ')).toEqual([{ lineIndex: 2, start: 2, end: 10 }]);
  });

  it('searchMatchesOf, for an empty query or one that is nowhere, finds nothing', () => {
    expect(searchMatchesOf(LINES, '')).toEqual([]);
    expect(searchMatchesOf(LINES, 'kafka')).toEqual([]);
  });
});

describe('wrappedMatchIndex', () => {
  it('wrappedMatchIndex, past either end, wraps around to the other', () => {
    expect(wrappedMatchIndex(2, 1, 3)).toBe(0);
    expect(wrappedMatchIndex(0, -1, 3)).toBe(2);
    expect(wrappedMatchIndex(0, 1, 0)).toBe(0);
  });
});

describe('searchedLinesOf', () => {
  it('searchedLinesOf, without a search, cuts each line at its tokens and numbers the lines from one', () => {
    const [, service] = searchedLinesOf(LINES, [], 0);

    expect(service?.number).toBe(2);
    expect(service?.segments).toEqual([
      { text: '  ', kind: null, highlight: 'none' },
      { text: '"service"', kind: 'key', highlight: 'none' },
      { text: ': ', kind: 'punctuation', highlight: 'none' },
      { text: '"atlas-api"', kind: 'string', highlight: 'none' },
      { text: ',', kind: 'punctuation', highlight: 'none' },
    ]);
  });

  it('searchedLinesOf, with matches, cuts inside a token and marks the current match apart from the others', () => {
    const matches = searchMatchesOf(LINES, 'atlas');
    const lines = searchedLinesOf(LINES, matches, 1);

    expect(lines[1]?.segments.slice(3)).toEqual([
      { text: '"', kind: 'string', highlight: 'none' },
      { text: 'atlas', kind: 'string', highlight: 'match' },
      { text: '-api"', kind: 'string', highlight: 'none' },
      { text: ',', kind: 'punctuation', highlight: 'none' },
    ]);
    expect(lines[2]?.segments.find((segment) => segment.highlight === 'current')?.text).toBe('atlas');
  });

  it('searchedLinesOf, for a match that spans two tokens, keeps each part in its own colour', () => {
    const lines = searchedLinesOf(LINES, searchMatchesOf(LINES, 'host": "at'), 0);

    expect(lines[2]?.segments.filter((segment) => segment.highlight === 'current')).toEqual([
      { text: 'host"', kind: 'key', highlight: 'current' },
      { text: ': ', kind: 'punctuation', highlight: 'current' },
      { text: '"at', kind: 'string', highlight: 'current' },
    ]);
  });

  it('searchedLinesOf, given the lines as they read without a search, hands back those very lines wherever there is no match', () => {
    const unsearched = searchedLinesOf(LINES, [], 0);
    const searched = searchedLinesOf(LINES, searchMatchesOf(LINES, 'prod'), 0, unsearched);

    expect(searched[1]).toBe(unsearched[1]);
    expect(searched[2]).not.toBe(unsearched[2]);
    expect(searched[2]?.segments.some((segment) => segment.highlight === 'current')).toBe(true);
  });
});
