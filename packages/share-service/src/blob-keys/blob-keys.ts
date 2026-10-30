const SESSIONS_FOLDER = 'sessions';
const STATE_NAME = 'state';
const FILES_FOLDER = 'files';

export type ChunkLocation = {
  readonly sessionId: string;
  readonly fileId: string;
  readonly index: number;
};

export const sessionPrefixOf = (sessionId: string): string => `${SESSIONS_FOLDER}/${sessionId}/`;

export const stateKeyOf = (sessionId: string): string => `${sessionPrefixOf(sessionId)}${STATE_NAME}`;

export const chunkKeyOf = (chunk: ChunkLocation): string => `${sessionPrefixOf(chunk.sessionId)}${FILES_FOLDER}/${chunk.fileId}/${chunk.index}`;
