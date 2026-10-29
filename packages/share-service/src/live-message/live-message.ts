import type { SessionTiming } from '../session-record/session-record';

export const LIVE_MESSAGE_KINDS = {
  REVISION: 'revision',
  RENEWED: 'renewed',
  EXPIRED: 'expired',
} as const;

export type LiveMessage =
  | { readonly kind: typeof LIVE_MESSAGE_KINDS.REVISION; readonly revision: number; readonly expiresAtMilliseconds: number }
  | { readonly kind: typeof LIVE_MESSAGE_KINDS.RENEWED; readonly expiresAtMilliseconds: number }
  | { readonly kind: typeof LIVE_MESSAGE_KINDS.EXPIRED };

export const revisionMessageOf = (timing: SessionTiming): LiveMessage => ({
  kind: LIVE_MESSAGE_KINDS.REVISION,
  revision: timing.revision,
  expiresAtMilliseconds: timing.expiresAtMilliseconds,
});

export const renewedMessageOf = (timing: SessionTiming): LiveMessage => ({
  kind: LIVE_MESSAGE_KINDS.RENEWED,
  expiresAtMilliseconds: timing.expiresAtMilliseconds,
});

export const EXPIRED_MESSAGE: LiveMessage = { kind: LIVE_MESSAGE_KINDS.EXPIRED };
