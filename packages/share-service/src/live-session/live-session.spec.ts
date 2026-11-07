import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ownerTokenHashOf } from '../owner-token/owner-token';
import { blobKeysOf, liveSessionOf } from '../testing/session-client';
import { LiveSession } from './live-session';

type HeldPut = {
  readonly bucket: R2Bucket;
  readonly started: Promise<void>;
  readonly release: () => void;
};

type Signal = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
};

const newSignal = (): Signal => {
  const resolver = { resolve: (): void => undefined };

  const promise = new Promise<void>((resolve) => {
    resolver.resolve = resolve;
  });

  return { promise, resolve: () => resolver.resolve() };
};

const bucketHoldingPuts = (bucket: R2Bucket): HeldPut => {
  const started = newSignal();
  const released = newSignal();

  const heldPut = async (key: string, value: ArrayBuffer): Promise<R2Object | null> => {
    started.resolve();
    await released.promise;

    return await bucket.put(key, value);
  };

  const held = new Proxy(bucket, {
    get: (target, property) => {
      if (property === 'put') {
        return heldPut;
      }

      const member: unknown = Reflect.get(target, property);

      return typeof member === 'function' ? member.bind(target) : member;
    },
  });

  return { bucket: held, started: started.promise, release: () => released.resolve() };
};

const SESSION_ID = 'LLLLLLLLLLLLLLLLLLLLLL';
const FILE_ID = 'FFFFFFFFFFFFFFFFFFFFFF';

describe('LiveSession', () => {
  it('create, then status, answers revision 0 until a state is stored, then the revision the store answered', async () => {
    const session = liveSessionOf(SESSION_ID);
    const ownerTokenHash = await ownerTokenHashOf('owner');
    await session.create(SESSION_ID, ownerTokenHash);

    const before = await session.status();
    const stored = await session.storeState({ ownerTokenHash, content: new Uint8Array([1]).buffer });
    const after = await session.status();

    expect(before.value?.revision).toBe(0);
    expect(stored.value?.revision).toBe(1);
    expect(after.value).toEqual(stored.value);
  });

  it('storeChunk, with a digest that is not the owner one, refuses it and stores nothing', async () => {
    const session = liveSessionOf('MMMMMMMMMMMMMMMMMMMMMM');
    await session.create('MMMMMMMMMMMMMMMMMMMMMM', await ownerTokenHashOf('owner'));

    const outcome = await session.storeChunk({ ownerTokenHash: await ownerTokenHashOf('stranger'), fileId: FILE_ID, index: 0, content: new ArrayBuffer(2) });

    expect(outcome.refusal).toBe('owner_token_rejected');
    expect(await blobKeysOf('MMMMMMMMMMMMMMMMMMMMMM')).toEqual([]);
  });

  it('storeChunk, when the session is ended while the chunk is still on its way to the bucket, takes the chunk back out and refuses it', async () => {
    const sessionId = 'OOOOOOOOOOOOOOOOOOOOOO';
    const ownerTokenHash = await ownerTokenHashOf('owner');

    const outcome = await runInDurableObject(liveSessionOf(sessionId), async (_instance, state) => {
      const held = bucketHoldingPuts(env.SESSION_BLOBS);
      const session = new LiveSession(state, { ...env, SESSION_BLOBS: held.bucket });
      await session.create(sessionId, ownerTokenHash);

      const storing = session.storeChunk({ ownerTokenHash, fileId: FILE_ID, index: 0, content: new ArrayBuffer(2) });
      await held.started;
      await session.end(ownerTokenHash);
      held.release();

      return await storing;
    });

    expect(outcome.refusal).toBe('session_not_found');
    expect(await blobKeysOf(sessionId)).toEqual([]);
  });

  it('end, with the owner digest, leaves an object that knows no session', async () => {
    const session = liveSessionOf('NNNNNNNNNNNNNNNNNNNNNN');
    const ownerTokenHash = await ownerTokenHashOf('owner');
    await session.create('NNNNNNNNNNNNNNNNNNNNNN', ownerTokenHash);

    const ended = await session.end(ownerTokenHash);
    const status = await session.status();

    expect(ended).toEqual({ refusal: null, value: null });
    expect(status.refusal).toBe('session_not_found');
  });
});
