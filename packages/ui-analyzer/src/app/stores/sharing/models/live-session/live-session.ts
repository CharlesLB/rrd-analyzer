import { MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import type { LogView } from '../../../logs/models/log-view/log-view';

export type SharedFile = {
  readonly name: string;
  readonly path: string;
  readonly isOnline: boolean;
};

export type SharedLog = {
  readonly name: string;
  readonly isOnline: boolean;
};

export type LiveSession = {
  readonly analysisId: string;
  readonly sessionId: string;
  readonly link: string;
  readonly revision: number;
  readonly expiresAtMilliseconds: number;
  readonly files: readonly SharedFile[];
  readonly log: SharedLog | null;
};

export type LogPublication = {
  readonly file: File;
  readonly view: LogView;
  readonly sendsContent: boolean;
};

export type SessionPublication = {
  readonly log: LogPublication | null;
};

const NO_MINUTES_LEFT = 0;
const INACTIVITY_MINUTES = 60;

export const minutesLeftOf = (expiresAtMilliseconds: number, nowMilliseconds: number): number =>
  Math.min(INACTIVITY_MINUTES, Math.max(NO_MINUTES_LEFT, Math.ceil((expiresAtMilliseconds - nowMilliseconds) / MILLISECONDS_PER_MINUTE)));

export const withSessionReplaced = (sessions: readonly LiveSession[], replacement: LiveSession): readonly LiveSession[] => [
  ...sessions.filter((session) => session.analysisId !== replacement.analysisId),
  replacement,
];

export const withoutSessionOf = (sessions: readonly LiveSession[], analysisId: string): readonly LiveSession[] =>
  sessions.filter((session) => session.analysisId !== analysisId);
