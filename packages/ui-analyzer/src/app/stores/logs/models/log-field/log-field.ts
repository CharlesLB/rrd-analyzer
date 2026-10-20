import * as R from 'remeda';
import { isLogRecord, type LogRecord } from '../log-source/log-source';
import { isWrittenDate, parseLogTimestamp } from '../log-timestamp/log-timestamp';

export type LogField = {
  readonly path: string;
  readonly presentCount: number;
  readonly textCount: number;
  readonly timestampCount: number;
  readonly writtenDateCount: number;
  readonly textLength: number;
  readonly distinctValues: readonly string[];
  readonly sample: unknown;
};

export type DiscoveredFields = {
  readonly fields: readonly LogField[];
  readonly sampledCount: number;
};

type Leaf = {
  readonly path: string;
  readonly value: unknown;
};

const SAMPLED_RECORDS = 400;
const DEEPEST_LEVEL = 4;
const DISTINCT_VALUES_KEPT = 60;
export const PATH_SEPARATOR = '.';

const valueUnder = (held: unknown, segments: readonly string[]): unknown => {
  if (segments.length === 0) {
    return held;
  }

  if (!isLogRecord(held)) {
    return undefined;
  }

  return R.pipe(
    R.range(0, segments.length),
    R.map((skipped) => segments.length - skipped),
    R.map((taken) => ({ key: segments.slice(0, taken).join(PATH_SEPARATOR), rest: segments.slice(taken) })),
    R.filter((candidate) => Object.hasOwn(held, candidate.key)),
    R.map((candidate) => valueUnder(held[candidate.key], candidate.rest)),
    R.find((value) => value !== undefined),
  );
};

export const valueAtPath = (record: LogRecord, path: string): unknown => (path === '' ? undefined : valueUnder(record, path.split(PATH_SEPARATOR)));

export const isMissingValue = (value: unknown): boolean => value === null || value === undefined || value === '';

const leavesOf = (record: LogRecord, prefix: string, level: number): readonly Leaf[] =>
  R.flatMap(Object.entries(record), ([key, value]) => {
    const path = prefix === '' ? key : `${prefix}${PATH_SEPARATOR}${key}`;

    return isLogRecord(value) && level < DEEPEST_LEVEL ? leavesOf(value, path, level + 1) : [{ path, value }];
  });

const fieldOf = (path: string, values: readonly unknown[]): LogField => {
  const written = R.filter(values, R.isString);

  return {
    path,
    presentCount: values.length,
    textCount: written.length,
    timestampCount: R.filter(values, (value) => parseLogTimestamp(value) !== null).length,
    writtenDateCount: R.filter(values, isWrittenDate).length,
    textLength: R.sumBy(written, (text) => text.length),
    distinctValues: R.pipe(
      values,
      R.filter((value) => !isMissingValue(value) && typeof value !== 'object'),
      R.map(String),
      R.unique(),
      R.take(DISTINCT_VALUES_KEPT),
    ),
    sample: values[0],
  };
};

const valuesByPathOf = (leaves: readonly Leaf[]): ReadonlyMap<string, readonly unknown[]> =>
  R.reduce(leaves, (grouped, leaf) => grouped.set(leaf.path, [...(grouped.get(leaf.path) ?? []), leaf.value]), new Map<string, readonly unknown[]>());

export const discoverLogFields = (records: readonly LogRecord[]): DiscoveredFields => {
  const sampled = R.take(records, SAMPLED_RECORDS);
  const leaves = R.flatMap(sampled, (record) => leavesOf(record, '', 0));

  return {
    fields: R.map([...valuesByPathOf(leaves).entries()], ([path, values]) => fieldOf(path, values)),
    sampledCount: sampled.length,
  };
};
