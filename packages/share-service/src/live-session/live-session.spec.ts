import { describe, expect, it } from 'vitest';
import { ownerTokenHashOf } from '../owner-token/owner-token';
import { blobKeysOf, liveSessionOf } from '../testing/session-client';

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
