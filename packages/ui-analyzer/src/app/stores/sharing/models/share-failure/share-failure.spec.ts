import { describe, expect, it } from 'vitest';
import { SHARE_FAILURES, shareFailureOf } from './share-failure';

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
});
