import type { LogView } from '../../../logs/models/log-view/log-view';

export type FollowedLog = {
  readonly fileId: string;
  readonly file: File;
  readonly view: LogView | null;
  readonly viewSignature: string;
};

export type FollowedSession = {
  readonly sessionId: string;
  readonly analysisId: string;
  readonly revision: number;
  readonly expiresAtMilliseconds: number;
  readonly liveUrl: string;
  readonly hasChanged: boolean;
  readonly log: FollowedLog | null;
};

export const LOG_HANDOVERS = {
  OPENED: 'opened',
  RESTYLED: 'restyled',
  REMOVED: 'removed',
} as const;

export type LogHandover =
  | { readonly kind: typeof LOG_HANDOVERS.OPENED; readonly file: File; readonly view: LogView | null }
  | { readonly kind: typeof LOG_HANDOVERS.RESTYLED; readonly view: LogView | null }
  | { readonly kind: typeof LOG_HANDOVERS.REMOVED };

const REMOVED_LOG: LogHandover = { kind: LOG_HANDOVERS.REMOVED };

export const logHandoverBetween = (shown: FollowedLog | null, arrived: FollowedLog | null): LogHandover | null => {
  if (arrived === null) {
    return shown === null ? null : REMOVED_LOG;
  }

  if (shown === null || shown.fileId !== arrived.fileId) {
    return { kind: LOG_HANDOVERS.OPENED, file: arrived.file, view: arrived.view };
  }

  return shown.viewSignature === arrived.viewSignature ? null : { kind: LOG_HANDOVERS.RESTYLED, view: arrived.view };
};
