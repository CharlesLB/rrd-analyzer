import { formatMessage, formatPlural, type LogTrackMessages } from '@rrd-analyzer/shared';
import type { ValueOf } from '../../../../shared/types/value-of';
import { formatCount } from '../../../../shared/utils/count-format/count-format.util';
import { LOG_STATUSES, type LogStatus } from '../../../../stores/logs/models/log-state/log-state';
import { type TimeRange, timestampRangeOf } from '../../../../stores/workspace/models/timeframe/timeframe';

export const TRACK_ACTIONS = {
  OPEN_SETUP: 'open-setup',
  SHOW_ALL_TYPES: 'show-all-types',
  JUMP_TO_LOGS: 'jump-to-logs',
} as const;

export type TrackAction = ValueOf<typeof TRACK_ACTIONS>;

type TrackNoticeAction = {
  readonly kind: TrackAction;
  readonly label: string;
};

type TrackNotice = {
  readonly text: string;
  readonly detail: string;
  readonly action: TrackNoticeAction | null;
  readonly isFailure: boolean;
};

export type TrackSituation = {
  readonly status: LogStatus;
  readonly fileName: string;
  readonly failureTitle: string;
  readonly recordCount: number;
  readonly isSetupOpen: boolean;
  readonly shownTypeCount: number;
  readonly inViewCount: number;
  readonly span: TimeRange | null;
  readonly bounds: TimeRange;
};

const NO_DETAIL = '';

const notice = (text: string, action: TrackNoticeAction | null = null, detail: string = NO_DETAIL): TrackNotice => ({ text, detail, action, isFailure: false });

const readyNoticeOf = (situation: TrackSituation, texts: LogTrackMessages): TrackNotice | null => {
  const { span, bounds } = situation;

  if (situation.shownTypeCount === 0) {
    return notice(texts.allHidden, { kind: TRACK_ACTIONS.SHOW_ALL_TYPES, label: texts.showAll });
  }

  if (situation.inViewCount > 0) {
    return null;
  }

  const detail = span === null ? NO_DETAIL : formatMessage(texts.span, timestampRangeOf(span));
  const overlapsData = span !== null && span.untilMilliseconds >= bounds.fromMilliseconds && span.fromMilliseconds <= bounds.untilMilliseconds;

  return overlapsData ? notice(texts.noneInWindow, { kind: TRACK_ACTIONS.JUMP_TO_LOGS, label: texts.jump }, detail) : notice(texts.outsideData, null, detail);
};

export const trackNoticeOf = (situation: TrackSituation, texts: LogTrackMessages): TrackNotice | null => {
  const openSetup: TrackNoticeAction = { kind: TRACK_ACTIONS.OPEN_SETUP, label: texts.openSetup };

  const notices: Readonly<Record<LogStatus, () => TrackNotice | null>> = {
    [LOG_STATUSES.NONE]: () => null,
    [LOG_STATUSES.LOADING]: () => notice(formatMessage(texts.parsing, { file: situation.fileName })),
    [LOG_STATUSES.FAILED]: () => ({
      ...notice(formatMessage(texts.failed, { file: situation.fileName, reason: situation.failureTitle }), { ...openSetup, label: texts.details }),
      isFailure: true,
    }),
    [LOG_STATUSES.SETUP]: () =>
      notice(formatPlural(texts.mapFields, situation.recordCount, { count: formatCount(situation.recordCount) }), situation.isSetupOpen ? null : openSetup),
    [LOG_STATUSES.READY]: () => readyNoticeOf(situation, texts),
  };

  return notices[situation.status]();
};
