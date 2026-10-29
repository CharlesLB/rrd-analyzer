import { SELF } from 'cloudflare:test';

export type CreatedSession = {
  readonly sessionId: string;
  readonly ownerToken: string;
  readonly expiresAtMilliseconds: number;
};

export type SessionTimingBody = {
  readonly revision: number;
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

const addressSequence = { lastIssuedNumber: 0 };

const nextClientAddress = (): string => {
  addressSequence.lastIssuedNumber += 1;

  return `198.51.100.${addressSequence.lastIssuedNumber}`;
};

export const urlOf = (path: string): string => `${SERVICE_ORIGIN}${path}`;

export const bytesOf = (length: number, fill = 7): Uint8Array => new Uint8Array(length).fill(fill);

export const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

export const createSession = async (clientAddress: string = nextClientAddress()): Promise<CreatedSession> => {
  const response = await SELF.fetch(urlOf('/api/sessions'), { method: 'POST', headers: { 'CF-Connecting-IP': clientAddress } });

  return await response.json<CreatedSession>();
};

export const putChunk = async (session: CreatedSession, fileId: string, index: number, content: Uint8Array): Promise<Response> =>
  await SELF.fetch(urlOf(`/api/sessions/${session.sessionId}/files/${fileId}/chunks/${index}`), {
    method: 'PUT',
    headers: bearer(session.ownerToken),
    body: content,
  });

export const getChunk = async (sessionId: string, fileId: string, index: number): Promise<Response> =>
  await SELF.fetch(urlOf(`/api/sessions/${sessionId}/files/${fileId}/chunks/${index}`));

export const putState = async (session: CreatedSession, content: Uint8Array): Promise<Response> =>
  await SELF.fetch(urlOf(`/api/sessions/${session.sessionId}/state`), { method: 'PUT', headers: bearer(session.ownerToken), body: content });

export const getState = async (sessionId: string): Promise<Response> => await SELF.fetch(urlOf(`/api/sessions/${sessionId}/state`));

export const getStatus = async (sessionId: string): Promise<Response> => await SELF.fetch(urlOf(`/api/sessions/${sessionId}`));

export const deleteSession = async (session: CreatedSession, ownerToken: string = session.ownerToken): Promise<Response> =>
  await SELF.fetch(urlOf(`/api/sessions/${session.sessionId}`), { method: 'DELETE', headers: bearer(ownerToken) });

export type LiveChannel = {
  readonly socket: WebSocket;
  readonly messages: unknown[];
  readonly nextMessage: () => Promise<unknown>;
  readonly closed: Promise<number>;
};

export const openLiveChannel = async (sessionId: string): Promise<LiveChannel> => {
  const response = await SELF.fetch(urlOf(`/api/sessions/${sessionId}/live`), { headers: { Upgrade: 'websocket', Origin: ALLOWED_ORIGIN } });
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

  return { socket, messages, nextMessage, closed };
};
