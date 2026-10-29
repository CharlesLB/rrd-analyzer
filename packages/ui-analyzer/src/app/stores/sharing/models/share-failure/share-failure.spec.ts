import { describe, expect, it } from 'vitest';
import { SHARE_FAILURES, ShareFailureError, shareFailureIn, shareFailureOf } from './share-failure';

describe('share failure', () => {
  it.each([
    { status: 404, failure: SHARE_FAILURES.GONE },
    { status: 400, failure: SHARE_FAILURES.INVALID_LINK },
    { status: 422, failure: SHARE_FAILURES.INVALID_LINK },
    { status: 413, failure: SHARE_FAILURES.TOO_LARGE },
    { status: 429, failure: SHARE_FAILURES.BUSY },
    { status: 502, failure: SHARE_FAILURES.UNREACHABLE },
    { status: 503, failure: SHARE_FAILURES.UNREACHABLE },
    { status: 500, failure: SHARE_FAILURES.OTHER },
    { status: 0, failure: SHARE_FAILURES.OTHER },
  ])('shareFailureOf, for a request that failed with $status, names it $failure', ({ status, failure }) => {
    expect(shareFailureOf(status)).toBe(failure);
  });

  it('shareFailureIn reads the failure a ShareFailureError carries, keeping what caused it', () => {
    const cause = new Error('502 from the gateway');
    const error = new ShareFailureError(SHARE_FAILURES.UNREACHABLE, cause);

    expect(shareFailureIn(error)).toBe(SHARE_FAILURES.UNREACHABLE);
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('ShareFailureError');
  });

  it('shareFailureIn, for any other error, names it OTHER', () => {
    expect(shareFailureIn(new Error('file unreadable'))).toBe(SHARE_FAILURES.OTHER);
  });
});
