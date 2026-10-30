import { describe, expect, it } from 'vitest';
import { EXPIRED_MESSAGE, renewedMessageOf, revisionMessageOf } from './live-message';

describe('live messages', () => {
  it('revisionMessageOf and renewedMessageOf, given a timing, carry what a viewer needs and nothing more', () => {
    const timing = { revision: 4, expiresAtMilliseconds: 9000 };

    const revision = revisionMessageOf(timing);
    const renewed = renewedMessageOf(timing);

    expect(revision).toEqual({ kind: 'revision', revision: 4, expiresAtMilliseconds: 9000 });
    expect(renewed).toEqual({ kind: 'renewed', expiresAtMilliseconds: 9000 });
    expect(EXPIRED_MESSAGE).toEqual({ kind: 'expired' });
  });
});
