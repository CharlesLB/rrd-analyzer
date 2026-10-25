import { formatMessage, formatPlural, type LogsMessages, MILLISECONDS_PER_MINUTE, type UnitMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { formatCount } from '../../../../shared/utils/count-format/count-format.util';
import { formatDuration, formatTimestampWithSeconds } from '../../../../shared/utils/date-format/date-format.util';
import { isMissingValue } from '../log-field/log-field';
import { LOG_ROLES, type LogMapping, type LogRole, MAXIMUM_DISTINCT_TYPES, UNMAPPED } from '../log-mapping/log-mapping';
import { type EntryReading, isPlaceable, readEntryOf } from '../log-reading/log-reading';
import { UNKNOWN_LOG_TYPE } from '../log-severity/log-severity';
import type { LogRecord } from '../log-source/log-source';
import { messageTextOf, placeableTypeCountsOf, rankedTypeCountsOf, type TypeCount } from '../log-timeline/log-timeline';

export const VALIDATION_STATES = {
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

type ValidationState = ValueOf<typeof VALIDATION_STATES>;

export type RoleValidation = {
  readonly state: ValidationState;
  readonly note: string;
};

export type MappingValidation = {
  readonly roles: Readonly<Record<LogRole, RoleValidation>>;
  readonly types: readonly TypeCount[];
  readonly isValid: boolean;
  readonly hasWarning: boolean;
};

export type ValidationTexts = {
  readonly logs: LogsMessages;
  readonly units: UnitMessages;
  readonly listSeparator: string;
};

const MESSAGE_SAMPLE_LENGTH = 64;
const ELLIPSIS = '…';
const SHORTEST_SPAN_MILLISECONDS = MILLISECONDS_PER_MINUTE;

const ok = (note: string): RoleValidation => ({ state: VALIDATION_STATES.OK, note });
const warning = (note: string): RoleValidation => ({ state: VALIDATION_STATES.WARNING, note });
const error = (note: string): RoleValidation => ({ state: VALIDATION_STATES.ERROR, note });

const counted = (count: number): { readonly count: string } => ({ count: formatCount(count) });

export const truncated = (text: string, length: number): string => (text.length > length ? `${text.slice(0, length - 1)}${ELLIPSIS}` : text);

export const timestampValidationOf = (readTimes: readonly (number | null)[], path: string, { logs, units }: ValidationTexts): RoleValidation => {
  const texts = logs.validation;

  if (path === UNMAPPED) {
    return error(texts.timestampRequired);
  }

  const times = R.filter(readTimes, R.isNonNullish);
  const [example] = times;

  if (example === undefined) {
    return error(formatMessage(texts.timestampNone, { field: path }));
  }

  if (times.length < readTimes.length) {
    return warning(formatMessage(texts.timestampPartial, { missing: formatCount(readTimes.length - times.length), total: formatCount(readTimes.length) }));
  }

  const [earliest, latest] = R.reduce(times, ([lowest, highest], time) => [Math.min(lowest, time), Math.max(highest, time)], [example, example]);

  return ok(
    formatMessage(texts.timestampOk, {
      example: formatTimestampWithSeconds(example),
      span: formatDuration(Math.max(SHORTEST_SPAN_MILLISECONDS, latest - earliest), units),
    }),
  );
};

export const typeValidationOf = (
  mapping: LogMapping,
  types: readonly TypeCount[],
  recordCount: number,
  { logs, listSeparator }: ValidationTexts,
): RoleValidation => {
  const texts = logs.validation;
  const path = mapping[LOG_ROLES.TYPE];
  const missingCount = types.find((type) => type.name === UNKNOWN_LOG_TYPE)?.count ?? 0;

  if (path === UNMAPPED) {
    return error(texts.typeRequired);
  }

  if (path === mapping[LOG_ROLES.TIMESTAMP]) {
    return error(texts.typeIsTimestamp);
  }

  if (types.length > MAXIMUM_DISTINCT_TYPES) {
    return error(formatMessage(texts.typeTooMany, { field: path, count: types.length }));
  }

  if (missingCount === recordCount) {
    return error(formatMessage(texts.fieldEmpty, { field: path }));
  }

  return missingCount > 0
    ? warning(formatPlural(texts.typePartial, missingCount, counted(missingCount)))
    : ok(formatPlural(texts.typeOk, types.length, { names: R.map(types, (type) => type.name).join(listSeparator) }));
};

export const messageValidationOf = (readMessages: readonly unknown[], mapping: LogMapping, { logs }: ValidationTexts): RoleValidation => {
  const texts = logs.validation;
  const path = mapping[LOG_ROLES.MESSAGE];

  if (path === UNMAPPED) {
    return error(texts.messageRequired);
  }

  if (path === mapping[LOG_ROLES.TIMESTAMP] || path === mapping[LOG_ROLES.TYPE]) {
    return error(texts.messageTaken);
  }

  const messages = R.filter(readMessages, (value) => !isMissingValue(value));
  const [sample] = messages;
  const missingCount = readMessages.length - messages.length;

  if (sample === undefined) {
    return error(formatMessage(texts.fieldEmpty, { field: path }));
  }

  return missingCount > 0
    ? warning(formatPlural(texts.messagePartial, missingCount, counted(missingCount)))
    : ok(formatMessage(texts.messageOk, { sample: truncated(messageTextOf(sample), MESSAGE_SAMPLE_LENGTH) }));
};

const typesToPlaceOf = (readings: readonly EntryReading[]): readonly TypeCount[] =>
  readings.some(isPlaceable) ? placeableTypeCountsOf(readings) : rankedTypeCountsOf(R.map(readings, (reading) => reading.type));

export const mappingValidationOf = (roles: Readonly<Record<LogRole, RoleValidation>>, readings: readonly EntryReading[]): MappingValidation => {
  const states = R.map(Object.values(roles), (role) => role.state);

  return {
    roles,
    types: roles[LOG_ROLES.TYPE].state === VALIDATION_STATES.ERROR ? [] : typesToPlaceOf(readings),
    isValid: !states.includes(VALIDATION_STATES.ERROR),
    hasWarning: states.includes(VALIDATION_STATES.WARNING),
  };
};

export const validateMapping = (records: readonly LogRecord[], mapping: LogMapping, texts: ValidationTexts): MappingValidation => {
  const readings = R.map(records, (record) => readEntryOf(record, mapping));
  const types = mapping[LOG_ROLES.TYPE] === UNMAPPED ? [] : rankedTypeCountsOf(R.map(readings, (reading) => reading.type));

  return mappingValidationOf(
    {
      [LOG_ROLES.TIMESTAMP]: timestampValidationOf(
        R.map(readings, (reading) => reading.timeMilliseconds),
        mapping[LOG_ROLES.TIMESTAMP],
        texts,
      ),
      [LOG_ROLES.TYPE]: typeValidationOf(mapping, types, records.length, texts),
      [LOG_ROLES.MESSAGE]: messageValidationOf(
        R.map(readings, (reading) => reading.message),
        mapping,
        texts,
      ),
    },
    readings,
  );
};
