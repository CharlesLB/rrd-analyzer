import { chunkIndexOf, isIdentifier } from '../identifiers/identifiers';

export const API_ROUTE_KINDS = {
  SESSIONS: 'sessions',
  SESSION: 'session',
  STATE: 'state',
  LIVE: 'live',
  CHUNK: 'chunk',
  MALFORMED: 'malformed',
  UNKNOWN: 'unknown',
} as const;

export type ApiRoute =
  | { readonly kind: typeof API_ROUTE_KINDS.SESSIONS }
  | { readonly kind: typeof API_ROUTE_KINDS.SESSION; readonly sessionId: string }
  | { readonly kind: typeof API_ROUTE_KINDS.STATE; readonly sessionId: string }
  | { readonly kind: typeof API_ROUTE_KINDS.LIVE; readonly sessionId: string }
  | { readonly kind: typeof API_ROUTE_KINDS.CHUNK; readonly sessionId: string; readonly fileId: string; readonly index: number }
  | { readonly kind: typeof API_ROUTE_KINDS.MALFORMED }
  | { readonly kind: typeof API_ROUTE_KINDS.UNKNOWN };

const PATH_SEPARATOR = '/';
const API_SEGMENT = 'api';
const SESSIONS_SEGMENT = 'sessions';
const STATE_SEGMENT = 'state';
const LIVE_SEGMENT = 'live';
const FILES_SEGMENT = 'files';
const CHUNKS_SEGMENT = 'chunks';
const SESSION_PATH_LENGTH = 1;
const SESSION_PART_PATH_LENGTH = 2;
const CHUNK_PATH_LENGTH = 5;

const MALFORMED: ApiRoute = { kind: API_ROUTE_KINDS.MALFORMED };
const UNKNOWN: ApiRoute = { kind: API_ROUTE_KINDS.UNKNOWN };

const SESSION_PART_KINDS: ReadonlyMap<string, typeof API_ROUTE_KINDS.STATE | typeof API_ROUTE_KINDS.LIVE> = new Map([
  [STATE_SEGMENT, API_ROUTE_KINDS.STATE],
  [LIVE_SEGMENT, API_ROUTE_KINDS.LIVE],
]);

const chunkRouteOf = (sessionId: string, fileId: string, indexText: string): ApiRoute => {
  const index = chunkIndexOf(indexText);

  return isIdentifier(fileId) && index !== null ? { kind: API_ROUTE_KINDS.CHUNK, sessionId, fileId, index } : MALFORMED;
};

const sessionRouteOf = (sessionPath: readonly string[]): ApiRoute => {
  const [sessionId, part, fileId, chunksPart, indexText] = sessionPath;
  const partKind = SESSION_PART_KINDS.get(part);
  const isChunkPath = sessionPath.length === CHUNK_PATH_LENGTH && part === FILES_SEGMENT && chunksPart === CHUNKS_SEGMENT;
  const isKnownPath = sessionPath.length === SESSION_PATH_LENGTH || (sessionPath.length === SESSION_PART_PATH_LENGTH && partKind !== undefined) || isChunkPath;

  if (!isKnownPath) {
    return UNKNOWN;
  }

  if (!isIdentifier(sessionId)) {
    return MALFORMED;
  }

  if (isChunkPath) {
    return chunkRouteOf(sessionId, fileId, indexText);
  }

  return partKind === undefined ? { kind: API_ROUTE_KINDS.SESSION, sessionId } : { kind: partKind, sessionId };
};

export const apiRouteOf = (pathname: string): ApiRoute => {
  const [, api, sessions, ...sessionPath] = pathname.split(PATH_SEPARATOR);

  if (api !== API_SEGMENT || sessions !== SESSIONS_SEGMENT) {
    return UNKNOWN;
  }

  return sessionPath.length === 0 ? { kind: API_ROUTE_KINDS.SESSIONS } : sessionRouteOf(sessionPath);
};
