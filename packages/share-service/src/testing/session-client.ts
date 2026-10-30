import { env, SELF } from 'cloudflare:test';
import { sessionPrefixOf } from '../blob-keys/blob-keys';
import type { LiveSession } from '../live-session/live-session';

export type CreatedSession = {
  readonly sessionId: string;
  readonly ownerToken: string;
  readonly expiresAtMilliseconds: number;
};

export type ErrorBody = {
  readonly error: string;
};

export const SERVICE_ORIGIN = 'https://share.example';
export const ALLOWED_ORIGIN = 'http://127.0.0.1:4210';
export const FILE_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
export const OTHER_FILE_ID = 'BBBBBBBBBBBBBBBBBBBBBB';
export const UNKNOWN_SESSION_ID = 'ZZZZZZZZZZZZZZZZZZZZZZ';
export const UNKNOWN_SESSION: CreatedSession = { sessionId: UNKNOWN_SESSION_ID, ownerToken: 'token', expiresAtMilliseconds: 0 };
export const SESSIONS_PATH = '/api/sessions';

const addressSequence = { lastIssuedNumber: 0 };

const nextClientAddress = (): string => {
  addressSequence.lastIssuedNumber += 1;

  return `198.51.100.${addressSequence.lastIssuedNumber}`;
};

export const urlOf = (path: string): string => `${SERVICE_ORIGIN}${path}`;

export const sessionPathOf = (sessionId: string): string => `${SESSIONS_PATH}/${sessionId}`;

export const statePathOf = (sessionId: string): string => `${sessionPathOf(sessionId)}/state`;

export const livePathOf = (sessionId: string): string => `${sessionPathOf(sessionId)}/live`;

export const chunkPathOf = (sessionId: string, fileId: string, index: number): string => `${sessionPathOf(sessionId)}/files/${fileId}/chunks/${index}`;

export const liveSessionOf = (sessionId: string): DurableObjectStub<LiveSession> => env.LIVE_SESSIONS.get(env.LIVE_SESSIONS.idFromName(sessionId));

export const blobKeysOf = async (sessionId: string): Promise<readonly string[]> =>
  (await env.SESSION_BLOBS.list({ prefix: sessionPrefixOf(sessionId) })).objects.map((object) => object.key);

export const bytesOf = (length: number, fill = 7): Uint8Array => new Uint8Array(length).fill(fill);

export const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

export const createSession = async (clientAddress: string = nextClientAddress()): Promise<CreatedSession> => {
  const response = await SELF.fetch(urlOf(SESSIONS_PATH), { method: 'POST', headers: { 'CF-Connecting-IP': clientAddress } });

  return await response.json<CreatedSession>();
};

export const putChunk = async (session: CreatedSession, fileId: string, index: number, content: BodyInit): Promise<Response> =>
  await SELF.fetch(urlOf(chunkPathOf(session.sessionId, fileId, index)), { method: 'PUT', headers: bearer(session.ownerToken), body: content });

export const getChunk = async (sessionId: string, fileId: string, index: number): Promise<Response> =>
  await SELF.fetch(urlOf(chunkPathOf(sessionId, fileId, index)));

export const putState = async (session: CreatedSession, content: Uint8Array): Promise<Response> =>
  await SELF.fetch(urlOf(statePathOf(session.sessionId)), { method: 'PUT', headers: bearer(session.ownerToken), body: content });

export const getState = async (sessionId: string): Promise<Response> => await SELF.fetch(urlOf(statePathOf(sessionId)));

export const getStatus = async (sessionId: string): Promise<Response> => await SELF.fetch(urlOf(sessionPathOf(sessionId)));

export const deleteSession = async (session: CreatedSession, ownerToken: string = session.ownerToken): Promise<Response> =>
  await SELF.fetch(urlOf(sessionPathOf(session.sessionId)), { method: 'DELETE', headers: bearer(ownerToken) });

export type LiveChannel = {
  readonly socket: WebSocket;
  readonly nextMessage: () => Promise<unknown>;
  readonly closed: Promise<number>;
};

export const openLiveChannel = async (sessionId: string): Promise<LiveChannel> => {
  const response = await SELF.fetch(urlOf(livePathOf(sessionId)), { headers: { Upgrade: 'websocket', Origin: ALLOWED_ORIGIN } });
  const socket = response.webSocket;

  if (socket === null) {
    throw new Error(`the live channel did not open: ${response.status}`);
  }

  const messages: unknown[] = [];
  const waiting: ((message: unknown) => void)[] = [];

  const closed = new Promise<number>((resolve) => {
    socket.addEventListener('close', (event) => resolve(event.code));
  });

  socket.addEventListener('message', (event) => {
    const message: unknown = JSON.parse(String(event.data));
    const waiter = waiting.shift();

    if (waiter === undefined) {
      messages.push(message);

      return;
    }

    waiter(message);
  });
  socket.accept();

  const nextMessage = async (): Promise<unknown> => {
    const queued = messages.shift();

    if (queued !== undefined) {
      return queued;
    }

    return await new Promise<unknown>((resolve) => {
      waiting.push(resolve);
    });
  };

  return { socket, nextMessage, closed };
};
