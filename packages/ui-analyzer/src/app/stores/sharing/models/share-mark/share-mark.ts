import { formatPlural, type SharingMarkMessages } from '@rrd-analyzer/shared';
import { type LiveSession, minutesLeftOf } from '../live-session/live-session';

export const SHARE_MARKS = {
  LOCAL: 'local',
  ONLINE: 'online',
  FOLLOWING: 'following',
} as const;

export type ShareMark =
  | { readonly kind: typeof SHARE_MARKS.LOCAL }
  | { readonly kind: typeof SHARE_MARKS.FOLLOWING }
  | { readonly kind: typeof SHARE_MARKS.ONLINE; readonly minutesLeft: number };

export type ShareMarkText = {
  readonly label: string;
  readonly tip: string;
  readonly isOnline: boolean;
};

type SharingSituation = {
  readonly sessionsByAnalysis: ReadonlyMap<string, LiveSession>;
  readonly followedAnalysisId: string | null;
  readonly nowMilliseconds: number;
};

const LOCAL_MARK: ShareMark = { kind: SHARE_MARKS.LOCAL };
const FOLLOWING_MARK: ShareMark = { kind: SHARE_MARKS.FOLLOWING };

export const shareMarkOf = (analysisId: string, situation: SharingSituation): ShareMark => {
  if (situation.followedAnalysisId === analysisId) {
    return FOLLOWING_MARK;
  }

  const session = situation.sessionsByAnalysis.get(analysisId);

  return session === undefined
    ? LOCAL_MARK
    : { kind: SHARE_MARKS.ONLINE, minutesLeft: minutesLeftOf(session.expiresAtMilliseconds, situation.nowMilliseconds) };
};

export const shareMarkTextOf = (mark: ShareMark, texts: SharingMarkMessages): ShareMarkText => {
  switch (mark.kind) {
    case SHARE_MARKS.LOCAL:
      return { label: texts.local, tip: texts.localTip, isOnline: false };
    case SHARE_MARKS.FOLLOWING:
      return { label: texts.following, tip: texts.followingTip, isOnline: true };
    case SHARE_MARKS.ONLINE:
      return { label: formatPlural(texts.online, mark.minutesLeft), tip: formatPlural(texts.onlineTip, mark.minutesLeft), isOnline: true };
  }
};
