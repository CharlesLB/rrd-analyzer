import { env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { stateKeyOf } from '../blob-keys/blob-keys';
import { type LiveSession, SESSION_RECORD_KEY } from '../live-session/live-session';
import type { SessionRecord, SessionTiming } from '../session-record/session-record';
import {
  ALLOWED_ORIGIN,
  blobKeysOf,
  bytesOf,
  type CreatedSession,
  chunkPathOf,
  createSession,
  deleteSession,
  type ErrorBody,
  FILE_ID,
  getChunk,
  getState,
  getStatus,
  livePathOf,
  liveSessionOf,
  OTHER_FILE_ID,
  openLiveChannel,
  putChunk,
  putState,
  SESSIONS_PATH,
  UNKNOWN_SESSION,
  UNKNOWN_SESSION_ID,
  urlOf,
} from '../testing/session-client';

const HOUR = 3_600_000;
const MINUTE = 60_000;
const THIRD_FILE_ID = 'CCCCCCCCCCCCCCCCCCCCCC';
const FOURTH_FILE_ID = 'DDDDDDDDDDDDDDDDDDDDDD';

const errorOf = async (response: Response): Promise<string> => (await response.json<ErrorBody>()).error;

const storedRecordOf = async (sessionId: string): Promise<SessionRecord | undefined> =>
  await runInDurableObject(liveSessionOf(sessionId), async (_instance, state) => await state.storage.get<SessionRecord>(SESSION_RECORD_KEY));

const expireAt = async (sessionId: string, expiresAtMilliseconds: number): Promise<void> => {
  await runInDurableObject(liveSessionOf(sessionId), async (_instance, state) => {
    const record = await state.storage.get<SessionRecord>(SESSION_RECORD_KEY);

    await state.storage.put(SESSION_RECORD_KEY, { ...record, expiresAtMilliseconds });
  });
};

describe('session API, creating a session', () => {
  it('POST /api/sessions, called, answers 201 with an identifier, an owner token and an expiry one hour away', async () => {
    const before = Date.now();

    const response = await SELF.fetch(urlOf(SESSIONS_PATH), { method: 'POST' });
    const created = await response.json<CreatedSession>();

    expect(response.status).toBe(201);
    expect(created.sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(created.ownerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.expiresAtMilliseconds).toBeGreaterThanOrEqual(before + HOUR);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('POST /api/sessions, past the limit for one client address, answers 429', async () => {
    const clientAddress = '203.0.113.9';
    const attempts = Array.from({ length: 10 }, () => clientAddress);

    await Promise.all(attempts.map(async (address) => await createSession(address)));
    const response = await SELF.fetch(urlOf(SESSIONS_PATH), { method: 'POST', headers: { 'CF-Connecting-IP': clientAddress } });

    expect(response.status).toBe(429);
    expect(await errorOf(response)).toBe('rate_limited');
  });

  it('GET /api/sessions/{id}, for a session just created, answers revision 0 and its expiry', async () => {
    const session = await createSession();

    const response = await getStatus(session.sessionId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 0, expiresAtMilliseconds: session.expiresAtMilliseconds });
  });

  it('GET /api/sessions/{id}, for a session that never existed, answers 404', async () => {
    const response = await getStatus(UNKNOWN_SESSION_ID);

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe('session_not_found');
  });
});

describe('session API, routing', () => {
  it.each([
    ['/api/sessions/short', 'malformed_request', 400],
    ['/api/sessions/AAAAAAAAAAAAAAAAAAAAAA/files/bad/chunks/0', 'malformed_request', 400],
    ['/api/sessions/AAAAAAAAAAAAAAAAAAAAAA/files/AAAAAAAAAAAAAAAAAAAAAA/chunks/70000', 'malformed_request', 400],
    ['/api/sessions/AAAAAAAAAAAAAAAAAAAAAA/nothing', 'route_not_found', 404],
    ['/api/other', 'route_not_found', 404],
    ['/not-an-asset.js', 'route_not_found', 404],
  ])('GET %s answers %s', async (path, failure, status) => {
    const response = await SELF.fetch(urlOf(path));

    expect(response.status).toBe(status);
    expect(await errorOf(response)).toBe(failure);
  });

  it('PATCH /api/sessions, a method the route does not take, answers 405 naming the ones it does', async () => {
    const response = await SELF.fetch(urlOf(SESSIONS_PATH), { method: 'PATCH' });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});

describe('session API, chunks', () => {
  it('PUT then GET a chunk, with the owner token, stores the sealed bytes and answers them back', async () => {
    const session = await createSession();
    const content = bytesOf(40);

    const stored = await putChunk(session, FILE_ID, 0, content);
    const read = await getChunk(session.sessionId, FILE_ID, 0);

    expect(stored.status).toBe(204);
    expect(read.status).toBe(200);
    expect(read.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(content);
  });

  it('PUT a chunk, without an owner token, answers 403', async () => {
    const session = await createSession();

    const response = await SELF.fetch(urlOf(chunkPathOf(session.sessionId, FILE_ID, 0)), { method: 'PUT', body: bytesOf(4) });

    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('owner_token_rejected');
  });

  it('PUT a chunk, with another session owner token, answers 403', async () => {
    const session = await createSession();
    const other = await createSession();

    const response = await putChunk({ ...session, ownerToken: other.ownerToken }, FILE_ID, 0, bytesOf(4));

    expect(response.status).toBe(403);
  });

  it('PUT a chunk, to a session that never existed, answers 404', async () => {
    const response = await putChunk(UNKNOWN_SESSION, FILE_ID, 0, bytesOf(4));

    expect(response.status).toBe(404);
  });

  it('PUT a chunk, declaring more bytes than a chunk may hold, answers 413', async () => {
    const session = await createSession();

    const response = await putChunk(session, FILE_ID, 0, bytesOf(65));

    expect(response.status).toBe(413);
    expect(await errorOf(response)).toBe('payload_too_large');
  });

  it('PUT a chunk, streamed without a declared length past the chunk limit, answers 413', async () => {
    const session = await createSession();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytesOf(40));
        controller.enqueue(bytesOf(40));
        controller.close();
      },
    });

    const response = await putChunk(session, FILE_ID, 0, body);

    expect(response.status).toBe(413);
  });

  it('PUT chunks, past the bytes a session may hold, answers 413 and keeps what was stored', async () => {
    const session = await createSession();

    await putChunk(session, FILE_ID, 0, bytesOf(60));
    await putChunk(session, FILE_ID, 1, bytesOf(60));
    const refused = await putChunk(session, FILE_ID, 2, bytesOf(60));

    expect(refused.status).toBe(413);
    expect(await errorOf(refused)).toBe('session_too_large');
    expect(await blobKeysOf(session.sessionId)).toHaveLength(2);
  });

  it('PUT a chunk again, under the same index, replaces it without counting its bytes twice', async () => {
    const session = await createSession();

    await putChunk(session, FILE_ID, 0, bytesOf(60));
    await putChunk(session, FILE_ID, 1, bytesOf(60));
    const replaced = await putChunk(session, FILE_ID, 1, bytesOf(60, 9));
    const read = await getChunk(session.sessionId, FILE_ID, 1);

    expect(replaced.status).toBe(204);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytesOf(60, 9));
  });

  it('PUT chunks, of more files than a session may hold, answers 413', async () => {
    const session = await createSession();

    await putChunk(session, FILE_ID, 0, bytesOf(1));
    await putChunk(session, OTHER_FILE_ID, 0, bytesOf(1));
    await putChunk(session, THIRD_FILE_ID, 0, bytesOf(1));
    const refused = await putChunk(session, FOURTH_FILE_ID, 0, bytesOf(1));

    expect(refused.status).toBe(413);
  });

  it('PUT chunks, more of them than the files and the bytes of a session can fill, answers 413 even when they are empty', async () => {
    const session = await createSession();
    const ceiling = Array.from({ length: 6 }, (_unused, index) => index);

    await Promise.all(ceiling.map(async (index) => await putChunk(session, FILE_ID, index, bytesOf(0))));
    const refused = await putChunk(session, FILE_ID, 6, bytesOf(0));

    expect(refused.status).toBe(413);
    expect(await errorOf(refused)).toBe('session_too_large');
    expect(await blobKeysOf(session.sessionId)).toHaveLength(6);
  });

  it('GET a chunk, that was never stored, answers 404', async () => {
    const session = await createSession();

    const response = await getChunk(session.sessionId, FILE_ID, 3);

    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe('chunk_not_found');
  });
});

describe('session API, state', () => {
  it('PUT the state, twice, answers revisions 1 and 2', async () => {
    const session = await createSession();

    const first = await putState(session, bytesOf(10));
    const second = await putState(session, bytesOf(12));

    expect(first.status).toBe(200);
    expect((await first.json<SessionTiming>()).revision).toBe(1);
    expect((await second.json<SessionTiming>()).revision).toBe(2);
  });

  it('GET the state, once published, answers the sealed bytes with the revision and expiry headers', async () => {
    const session = await createSession();
    await putState(session, bytesOf(10, 3));

    const response = await getState(session.sessionId);
    const status = await (await getStatus(session.sessionId)).json<SessionTiming>();

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytesOf(10, 3));
    expect(response.headers.get('X-Session-Revision')).toBe('1');
    expect(response.headers.get('X-Session-Expires-At')).toBe(String(status.expiresAtMilliseconds));
  });

  it('GET the state, before any was published, answers 409', async () => {
    const session = await createSession();

    const response = await getState(session.sessionId);

    expect(response.status).toBe(409);
    expect(await errorOf(response)).toBe('state_not_published');
  });

  it('GET the state, of a session that never existed, answers 404', async () => {
    const response = await getState(UNKNOWN_SESSION_ID);

    expect(response.status).toBe(404);
  });

  it('GET the state, when its blob is missing from the bucket, answers 409', async () => {
    const session = await createSession();
    await putState(session, bytesOf(10));
    await env.SESSION_BLOBS.delete(stateKeyOf(session.sessionId));

    const response = await getState(session.sessionId);

    expect(response.status).toBe(409);
  });

  it('PUT the state, larger than a state may be, answers 413', async () => {
    const session = await createSession();

    const response = await putState(session, bytesOf(49));

    expect(response.status).toBe(413);
  });

  it('PUT the state, with a wrong owner token, answers 403', async () => {
    const session = await createSession();

    const response = await putState({ ...session, ownerToken: 'wrong' }, bytesOf(4));

    expect(response.status).toBe(403);
  });
});

describe('session API, activity and expiry', () => {
  it('PUT a chunk, on a session about to expire, moves its expiry an hour away', async () => {
    const session = await createSession();
    const soon = Date.now() + 1000;
    await expireAt(session.sessionId, soon);

    await putChunk(session, FILE_ID, 0, bytesOf(4));
    const record = await storedRecordOf(session.sessionId);

    expect(record?.expiresAtMilliseconds).toBeGreaterThan(soon + HOUR - 5000);
  });

  it('GET the state, by a viewer, renews the session', async () => {
    const session = await createSession();
    await putState(session, bytesOf(4));
    const soon = Date.now() + 1000;
    await expireAt(session.sessionId, soon);

    await getState(session.sessionId);
    const record = await storedRecordOf(session.sessionId);

    expect(record?.expiresAtMilliseconds).toBeGreaterThan(soon + HOUR - 5000);
  });

  it('GET the state, right after the owner published it, leaves the expiry the publication set and tells no viewer anything', async () => {
    const session = await createSession();
    const published = await (await putState(session, bytesOf(4))).json<SessionTiming>();
    const channel = await openLiveChannel(session.sessionId);

    const opened = await getState(session.sessionId);
    await deleteSession(session);

    expect(opened.headers.get('X-Session-Expires-At')).toBe(String(published.expiresAtMilliseconds));
    expect(await channel.nextMessage()).toEqual({ kind: 'expired' });
  });

  it('GET the status, of a session about to expire, leaves its expiry where it was', async () => {
    const session = await createSession();
    const soon = Date.now() + 1000;
    await expireAt(session.sessionId, soon);

    const status = await (await getStatus(session.sessionId)).json<SessionTiming>();

    expect(status.expiresAtMilliseconds).toBe(soon);
  });

  it('GET the status, of a session past its expiry whose alarm has not run, answers 404 and erases it', async () => {
    const session = await createSession();
    await putChunk(session, FILE_ID, 0, bytesOf(4));
    await expireAt(session.sessionId, Date.now() - 1);

    const response = await getStatus(session.sessionId);

    expect(response.status).toBe(404);
    expect(await blobKeysOf(session.sessionId)).toEqual([]);
    expect(await storedRecordOf(session.sessionId)).toBeUndefined();
  });

  it('the alarm, when it fires, erases every blob and the record and tells viewers the session expired', async () => {
    const session = await createSession();
    await putChunk(session, FILE_ID, 0, bytesOf(4));
    await putState(session, bytesOf(4));
    const channel = await openLiveChannel(session.sessionId);

    const ran = await runDurableObjectAlarm(liveSessionOf(session.sessionId));

    expect(ran).toBe(true);
    expect(await channel.nextMessage()).toEqual({ kind: 'expired' });
    expect(await channel.closed).toBe(1000);
    expect(await blobKeysOf(session.sessionId)).toEqual([]);
    expect((await getStatus(session.sessionId)).status).toBe(404);
  });

  it('the alarm, on an object holding no session, does nothing', async () => {
    const stub = liveSessionOf(UNKNOWN_SESSION_ID);

    await runInDurableObject(stub, async (instance: LiveSession) => await instance.alarm());

    expect((await getStatus(UNKNOWN_SESSION_ID)).status).toBe(404);
  });
});

describe('session API, ending a session', () => {
  it('DELETE /api/sessions/{id}, with the owner token, erases everything at once', async () => {
    const session = await createSession();
    await putChunk(session, FILE_ID, 0, bytesOf(4));
    await putState(session, bytesOf(4));

    const response = await deleteSession(session);

    expect(response.status).toBe(204);
    expect((await getStatus(session.sessionId)).status).toBe(404);
    expect((await getState(session.sessionId)).status).toBe(404);
    expect((await getChunk(session.sessionId, FILE_ID, 0)).status).toBe(404);
  });

  it('DELETE /api/sessions/{id}, with a wrong owner token, answers 403 and keeps the session', async () => {
    const session = await createSession();

    const response = await deleteSession(session, 'wrong');

    expect(response.status).toBe(403);
    expect((await getStatus(session.sessionId)).status).toBe(200);
  });

  it('DELETE /api/sessions/{id}, for a session that never existed, answers 404', async () => {
    const response = await deleteSession(UNKNOWN_SESSION);

    expect(response.status).toBe(404);
  });
});

describe('session API, live channel', () => {
  it('a viewer on the live channel, when the owner publishes, is told the new revision', async () => {
    const session = await createSession();
    const channel = await openLiveChannel(session.sessionId);

    const published = await (await putState(session, bytesOf(4))).json<SessionTiming>();

    expect(await channel.nextMessage()).toEqual({ kind: 'revision', revision: 1, expiresAtMilliseconds: published.expiresAtMilliseconds });
  });

  it('a viewer on the live channel, when someone opens the link of a session a while after its last activity, is told the session was renewed', async () => {
    const session = await createSession();
    await putState(session, bytesOf(4));
    await expireAt(session.sessionId, Date.now() + HOUR - MINUTE);
    const channel = await openLiveChannel(session.sessionId);

    const opened = await getState(session.sessionId);

    expect(await channel.nextMessage()).toEqual({ kind: 'renewed', expiresAtMilliseconds: Number(opened.headers.get('X-Session-Expires-At')) });
  });

  it('a viewer on the live channel, when the owner ends the session, is told it expired and the socket closes', async () => {
    const session = await createSession();
    const channel = await openLiveChannel(session.sessionId);

    await deleteSession(session);

    expect(await channel.nextMessage()).toEqual({ kind: 'expired' });
    expect(await channel.closed).toBe(1000);
  });

  it('GET live, without a WebSocket upgrade, answers 426', async () => {
    const session = await createSession();

    const response = await SELF.fetch(urlOf(livePathOf(session.sessionId)));

    expect(response.status).toBe(426);
  });

  it('GET live, from an origin that is not allowed, answers 403', async () => {
    const session = await createSession();

    const response = await SELF.fetch(urlOf(livePathOf(session.sessionId)), {
      headers: { Upgrade: 'websocket', Origin: 'https://elsewhere.example' },
    });

    expect(response.status).toBe(403);
    expect(await errorOf(response)).toBe('origin_forbidden');
  });

  it('GET live, for a session that never existed, answers 404 and opens nothing', async () => {
    const response = await SELF.fetch(urlOf(livePathOf(UNKNOWN_SESSION_ID)), { headers: { Upgrade: 'websocket' } });

    expect(response.status).toBe(404);
    expect(response.webSocket).toBeNull();
  });
});

describe('session API, cross-origin requests', () => {
  it('OPTIONS, from an allowed origin, answers 204 with the methods, headers and exposed headers', async () => {
    const response = await SELF.fetch(urlOf(SESSIONS_PATH), { method: 'OPTIONS', headers: { Origin: ALLOWED_ORIGIN } });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-Session-Revision, X-Session-Expires-At');
  });

  it('OPTIONS, from an origin that is not allowed, answers 403 without granting it anything', async () => {
    const response = await SELF.fetch(urlOf(SESSIONS_PATH), { method: 'OPTIONS', headers: { Origin: 'https://elsewhere.example' } });

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
