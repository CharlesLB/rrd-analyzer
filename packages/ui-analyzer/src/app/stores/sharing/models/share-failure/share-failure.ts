import type { ValueOf } from '../../../../shared/types/value-of';

export const SHARE_FAILURES = {
  GONE: 'gone',
  INVALID_LINK: 'invalid-link',
  TOO_LARGE: 'too-large',
  BUSY: 'busy',
  UNREACHABLE: 'unreachable',
  OTHER: 'other',
} as const;

export type ShareFailure = ValueOf<typeof SHARE_FAILURES>;

const FAILURES_BY_STATUS: ReadonlyMap<number, ShareFailure> = new Map([
  [400, SHARE_FAILURES.INVALID_LINK],
  [404, SHARE_FAILURES.GONE],
  [413, SHARE_FAILURES.TOO_LARGE],
  [422, SHARE_FAILURES.INVALID_LINK],
  [429, SHARE_FAILURES.BUSY],
  [502, SHARE_FAILURES.UNREACHABLE],
  [503, SHARE_FAILURES.UNREACHABLE],
]);

export const shareFailureOf = (status: number): ShareFailure => FAILURES_BY_STATUS.get(status) ?? SHARE_FAILURES.OTHER;

const SHARE_FAILURE_ERROR_NAME = 'ShareFailureError';

export class ShareFailureError extends Error {
  public readonly failure: ShareFailure;

  public constructor(failure: ShareFailure, cause: unknown) {
    super(`sharing failed: ${failure}`, { cause });
    this.name = SHARE_FAILURE_ERROR_NAME;
    this.failure = failure;
  }
}

export const shareFailureIn = (error: unknown): ShareFailure => (error instanceof ShareFailureError ? error.failure : SHARE_FAILURES.OTHER);
