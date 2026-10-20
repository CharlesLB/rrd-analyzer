import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import type { JsonLine, JsonTokenKind } from '../json-lines/json-lines';

export const HIGHLIGHTS = {
  NONE: 'none',
  MATCH: 'match',
  CURRENT: 'current',
} as const;

export type Highlight = ValueOf<typeof HIGHLIGHTS>;

export type SearchMatch = {
  readonly lineIndex: number;
  readonly start: number;
  readonly end: number;
};

export type LineSegment = {
  readonly text: string;
  readonly kind: JsonTokenKind | null;
  readonly highlight: Highlight;
};

export type SearchedLine = {
  readonly number: number;
  readonly segments: readonly LineSegment[];
};

type Span = {
  readonly start: number;
  readonly end: number;
};

const lowerCaseKeepingLength = (unit: string): string => {
  const lowered = unit.toLowerCase();

  return lowered.length === unit.length ? lowered : unit;
};

const foldedCaseOf = (text: string): string => {
  const lowered = text.toLowerCase();

  return lowered.length === text.length ? lowered : R.join(R.map(text.split(''), lowerCaseKeepingLength), '');
};

const matchSpansOf = (text: string, query: string): readonly Span[] =>
  R.reduce(
    R.dropLast(foldedCaseOf(text).split(query), 1),
    (found: readonly Span[], part) => {
      const start = (R.last(found)?.end ?? 0) + part.length;

      return [...found, { start, end: start + query.length }];
    },
    [],
  );

export const searchMatchesOf = (lines: readonly JsonLine[], query: string): readonly SearchMatch[] => {
  const sought = foldedCaseOf(query);

  return sought === '' ? [] : R.flatMap(lines, (line, lineIndex) => R.map(matchSpansOf(line.text, sought), (span) => ({ lineIndex, ...span })));
};

export const wrappedMatchIndex = (current: number, step: number, total: number): number => (total === 0 ? 0 : (((current + step) % total) + total) % total);

const covering = <TSpan extends Span>(spans: readonly TSpan[], position: number): TSpan | undefined =>
  spans.find((span) => span.start <= position && span.end > position);

const highlightOf = (match: SearchMatch | undefined, current: SearchMatch | undefined): Highlight => {
  if (match === undefined) {
    return HIGHLIGHTS.NONE;
  }

  return match === current ? HIGHLIGHTS.CURRENT : HIGHLIGHTS.MATCH;
};

const segmentsOf = (line: JsonLine, matches: readonly SearchMatch[], current: SearchMatch | undefined): readonly LineSegment[] => {
  const cuts = R.pipe([0, line.text.length, ...R.flatMap([...line.tokens, ...matches], (span) => [span.start, span.end])], R.unique(), R.sortBy(R.identity()));

  return R.pipe(
    R.zip(cuts, R.drop(cuts, 1)),
    R.map(([start, end]) => ({
      text: line.text.slice(start, end),
      kind: covering(line.tokens, start)?.kind ?? null,
      highlight: highlightOf(covering(matches, start), current),
    })),
  );
};

const NO_KEPT_LINES: readonly SearchedLine[] = [];

export const searchedLinesOf = (
  lines: readonly JsonLine[],
  matches: readonly SearchMatch[],
  currentIndex: number,
  unsearched: readonly SearchedLine[] = NO_KEPT_LINES,
): readonly SearchedLine[] => {
  const current = matches[currentIndex];
  const matchesByLine = R.groupBy(matches, (match) => match.lineIndex);

  return R.map(lines, (line, lineIndex) => {
    const onLine = matchesByLine[lineIndex];
    const kept = unsearched[lineIndex];

    return onLine === undefined && kept !== undefined ? kept : { number: lineIndex + 1, segments: segmentsOf(line, onLine ?? [], current) };
  });
};
