import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { type DiscoveredFields, type LogField, PATH_SEPARATOR } from '../log-field/log-field';
import { isSeverityName } from '../log-severity/log-severity';

export const LOG_ROLES = {
  TIMESTAMP: 'timestamp',
  TYPE: 'type',
  MESSAGE: 'message',
} as const;

export type LogRole = ValueOf<typeof LOG_ROLES>;

export type LogMapping = Readonly<Record<LogRole, string>>;

export const LOG_ROLE_ORDER: readonly LogRole[] = [LOG_ROLES.TIMESTAMP, LOG_ROLES.TYPE, LOG_ROLES.MESSAGE];

export const UNMAPPED = '';

export const EMPTY_MAPPING: LogMapping = { [LOG_ROLES.TIMESTAMP]: UNMAPPED, [LOG_ROLES.TYPE]: UNMAPPED, [LOG_ROLES.MESSAGE]: UNMAPPED };

export const MAXIMUM_DISTINCT_TYPES = 24;

const TIMESTAMP_NAME = /(time|timestamp|^ts$|date|logged)/i;
const TYPE_NAME = /^(level|lvl|severity|sev|type|loglevel|log_level|priority|kind)$/i;
const MESSAGE_NAME = /^(msg|message|text|description|error|err|summary|detail|details|reason|title)$/i;
const TIMESTAMP_SHARE = 0.8;
const TEXT_SHARE = 0.6;
const PLAUSIBLE_SCORE = 1;
const TIMESTAMP_SCORE = 5;
const WRITTEN_DATE_SCORE = 3;
const NAME_SCORE = 10;
const SEVERITY_SCORE = 6;
const LONGEST_TEXT_SCORE = 4;
const CHARACTERS_PER_TEXT_POINT = 20;
const NOT_A_CANDIDATE = 0;

const lastSegmentOf = (field: LogField): string => {
  const [lastSegment] = R.reverse(field.path.split(PATH_SEPARATOR));

  return lastSegment;
};

const namedScoreOf = (field: LogField, names: RegExp): number => (names.test(lastSegmentOf(field)) ? NAME_SCORE : 0);

const bestPathOf = (fields: readonly LogField[], scoreOf: (field: LogField) => number): string =>
  R.pipe(
    fields,
    R.map((field) => ({ path: field.path, score: scoreOf(field) })),
    R.filter((candidate) => candidate.score > NOT_A_CANDIDATE),
    R.firstBy([(candidate) => candidate.score, 'desc']),
  )?.path ?? UNMAPPED;

export const detectMapping = ({ fields, sampledCount }: DiscoveredFields): LogMapping => {
  const isMostlyText = (field: LogField): boolean => field.textCount / sampledCount > TEXT_SHARE;

  const timestamp = bestPathOf(fields, (field) =>
    field.timestampCount / sampledCount > TIMESTAMP_SHARE
      ? TIMESTAMP_SCORE + namedScoreOf(field, TIMESTAMP_NAME) + (field.writtenDateCount / sampledCount > TIMESTAMP_SHARE ? WRITTEN_DATE_SCORE : 0)
      : NOT_A_CANDIDATE,
  );

  const type = bestPathOf(fields, (field) =>
    field.path !== timestamp && isMostlyText(field) && field.distinctValues.length <= MAXIMUM_DISTINCT_TYPES
      ? PLAUSIBLE_SCORE + namedScoreOf(field, TYPE_NAME) + (field.distinctValues.some(isSeverityName) ? SEVERITY_SCORE : 0)
      : NOT_A_CANDIDATE,
  );

  const message = bestPathOf(fields, (field) =>
    field.path !== timestamp && field.path !== type && isMostlyText(field)
      ? PLAUSIBLE_SCORE +
        Math.min(LONGEST_TEXT_SCORE, field.textLength / Math.max(1, field.textCount) / CHARACTERS_PER_TEXT_POINT) +
        namedScoreOf(field, MESSAGE_NAME)
      : NOT_A_CANDIDATE,
  );

  return { [LOG_ROLES.TIMESTAMP]: timestamp, [LOG_ROLES.TYPE]: type, [LOG_ROLES.MESSAGE]: message };
};

export const withRoleMapped = (mapping: LogMapping, role: LogRole, path: string): LogMapping => ({ ...mapping, [role]: path });

export const isSameMapping = (first: LogMapping, second: LogMapping): boolean => R.isDeepEqual(first, second);
