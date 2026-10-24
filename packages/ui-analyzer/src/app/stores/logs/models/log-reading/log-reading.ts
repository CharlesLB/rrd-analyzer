import { isMissingValue, valueAtPath } from '../log-field/log-field';
import { LOG_ROLES, type LogMapping } from '../log-mapping/log-mapping';
import { UNKNOWN_LOG_TYPE } from '../log-severity/log-severity';
import type { LogRecord } from '../log-source/log-source';
import { parseLogTimestamp } from '../log-timestamp/log-timestamp';

export type EntryReading = {
  readonly timeMilliseconds: number | null;
  readonly type: string;
  readonly message: unknown;
};

const typeNameOf = (value: unknown): string => (isMissingValue(value) || typeof value === 'object' ? UNKNOWN_LOG_TYPE : String(value));

export const readTimeOf = (record: LogRecord, path: string): number | null => parseLogTimestamp(valueAtPath(record, path));

export const readTypeOf = (record: LogRecord, path: string): string => typeNameOf(valueAtPath(record, path));

export const readMessageOf = (record: LogRecord, path: string): unknown => valueAtPath(record, path);

export const readEntryOf = (record: LogRecord, mapping: LogMapping): EntryReading => ({
  timeMilliseconds: readTimeOf(record, mapping[LOG_ROLES.TIMESTAMP]),
  type: readTypeOf(record, mapping[LOG_ROLES.TYPE]),
  message: readMessageOf(record, mapping[LOG_ROLES.MESSAGE]),
});

export const isPlaceable = (reading: EntryReading): boolean => reading.timeMilliseconds !== null;
