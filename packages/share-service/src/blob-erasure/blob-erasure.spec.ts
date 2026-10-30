import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { eraseBlobsUnder } from './blob-erasure';

const keysUnder = async (prefix: string): Promise<readonly string[]> => (await env.SESSION_BLOBS.list({ prefix })).objects.map((object) => object.key);

describe('eraseBlobsUnder', () => {
  it('given more blobs than one page holds, erases every one of them and nothing outside the prefix', async () => {
    const keys = ['erase/a', 'erase/b', 'erase/c', 'erase/d', 'erase/e'];
    await Promise.all([...keys, 'keep/a'].map(async (key) => await env.SESSION_BLOBS.put(key, 'x')));

    await eraseBlobsUnder(env.SESSION_BLOBS, 'erase/', 2);

    expect(await keysUnder('erase/')).toEqual([]);
    expect(await keysUnder('keep/')).toEqual(['keep/a']);
  });

  it('given a prefix holding nothing, deletes nothing', async () => {
    await env.SESSION_BLOBS.put('other/a', 'x');

    await eraseBlobsUnder(env.SESSION_BLOBS, 'empty/', 2);

    expect(await keysUnder('other/')).toEqual(['other/a']);
  });
});
