import { type LiveSession, minutesLeftOf } from '../../../../stores/sharing/models/live-session/live-session';

export const SHARE_MARKS = {
  LOCAL: 'local',
  ONLINE: 'online',
  FOLLOWING: 'following',
} as const;

export type ShareMark =
  | { readonly kind: typeof SHARE_MARKS.LOCAL }
  | { readonly kind: typeof SHARE_MARKS.FOLLOWING }
  | { readonly kind: typeof SHARE_MARKS.ONLINE; readonly minutesLeft: number };

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
