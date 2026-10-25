import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';

export const JSON_TOKEN_KINDS = {
  KEY: 'key',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  NULL: 'null',
  PUNCTUATION: 'punctuation',
} as const;

export type JsonTokenKind = ValueOf<typeof JSON_TOKEN_KINDS>;

type JsonToken = {
  readonly start: number;
  readonly end: number;
  readonly kind: JsonTokenKind;
};

export type JsonLine = {
  readonly text: string;
  readonly tokens: readonly JsonToken[];
};

type Piece = {
  readonly text: string;
  readonly kind: JsonTokenKind | null;
};

type Member = {
  readonly key: string | null;
  readonly value: unknown;
};

type Container = {
  readonly members: readonly Member[];
  readonly opening: string;
  readonly closing: string;
};

type TokenPlacement = {
  readonly offset: number;
  readonly tokens: readonly JsonToken[];
};

const INDENT = '  ';
const NULL_TEXT = 'null';
const KEY_SEPARATOR = ': ';
const MEMBER_SEPARATOR = ',';
const NO_PIECES: readonly Piece[] = [];
const NOTHING_PLACED: TokenPlacement = { offset: 0, tokens: [] };

const punctuation = (text: string): Piece => ({ text, kind: JSON_TOKEN_KINDS.PUNCTUATION });

const indentOf = (depth: number): Piece => ({ text: INDENT.repeat(depth), kind: null });

const containerOf = (value: unknown): Container | null => {
  if (Array.isArray(value)) {
    return { members: R.map(value, (member: unknown) => ({ key: null, value: member })), opening: '[', closing: ']' };
  }

  return typeof value === 'object' && value !== null
    ? { members: R.map(Object.entries(value), ([key, member]: [string, unknown]) => ({ key, value: member })), opening: '{', closing: '}' }
    : null;
};

const scalarOf = (value: unknown): Piece => {
  if (typeof value === 'string') {
    return { text: JSON.stringify(value), kind: JSON_TOKEN_KINDS.STRING };
  }

  if (typeof value === 'number') {
    return { text: String(value), kind: JSON_TOKEN_KINDS.NUMBER };
  }

  return typeof value === 'boolean' ? { text: String(value), kind: JSON_TOKEN_KINDS.BOOLEAN } : { text: NULL_TEXT, kind: JSON_TOKEN_KINDS.NULL };
};

const memberLeadOf = (member: Member, depth: number): readonly Piece[] =>
  member.key === null ? [indentOf(depth)] : [indentOf(depth), { text: JSON.stringify(member.key), kind: JSON_TOKEN_KINDS.KEY }, punctuation(KEY_SEPARATOR)];

const pieceLinesOf = (value: unknown, depth: number, lead: readonly Piece[], trail: readonly Piece[]): readonly (readonly Piece[])[] => {
  const container = containerOf(value);

  if (container === null) {
    return [[...lead, scalarOf(value), ...trail]];
  }

  const { members, opening, closing } = container;

  if (members.length === 0) {
    return [[...lead, punctuation(`${opening}${closing}`), ...trail]];
  }

  return [
    [...lead, punctuation(opening)],
    ...R.flatMap(members, (member, index) =>
      pieceLinesOf(member.value, depth + 1, memberLeadOf(member, depth + 1), index < members.length - 1 ? [punctuation(MEMBER_SEPARATOR)] : NO_PIECES),
    ),
    [indentOf(depth), punctuation(closing), ...trail],
  ];
};

const tokensAfter = (placed: TokenPlacement, piece: Piece): TokenPlacement => {
  const end = placed.offset + piece.text.length;

  return { offset: end, tokens: piece.kind === null ? placed.tokens : [...placed.tokens, { start: placed.offset, end, kind: piece.kind }] };
};

const lineOf = (pieces: readonly Piece[]): JsonLine => ({
  text: R.map(pieces, (piece) => piece.text).join(''),
  tokens: R.reduce(pieces, tokensAfter, NOTHING_PLACED).tokens,
});

export const jsonLinesOf = (value: unknown): readonly JsonLine[] => R.map(pieceLinesOf(value, 0, NO_PIECES, NO_PIECES), lineOf);
