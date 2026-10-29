import { describe, expect, it } from 'vitest';
import { chunkKeyOf, sessionPrefixOf, stateKeyOf } from './blob-keys';

describe('blob keys', () => {
  it('keeps a session state and its chunks under the session prefix', () => {
    const sessionId = 'AAAAAAAAAAAAAAAAAAAAAA';

    const prefix = sessionPrefixOf(sessionId);
    const state = stateKeyOf(sessionId);
    const chunk = chunkKeyOf({ sessionId, fileId: 'BBBBBBBBBBBBBBBBBBBBBB', index: 3 });

    expect(prefix).toBe('sessions/AAAAAAAAAAAAAAAAAAAAAA/');
    expect(state).toBe('sessions/AAAAAAAAAAAAAAAAAAAAAA/state');
    expect(chunk).toBe('sessions/AAAAAAAAAAAAAAAAAAAAAA/files/BBBBBBBBBBBBBBBBBBBBBB/3');
  });
});
