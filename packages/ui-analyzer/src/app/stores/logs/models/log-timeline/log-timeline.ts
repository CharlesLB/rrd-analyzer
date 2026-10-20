import type { LogsMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { TimeRange } from '../../../workspace/models/timeframe/timeframe';
import { isMissingValue } from '../log-field/log-field';
import type { LogMapping } from '../log-mapping/log-mapping';
import { type EntryReading, isPlaceable, readEntryOf } from '../log-reading/log-reading';
import { severityRankOf } from '../log-severity/log-severity';
import type { LogRecord } from '../log-source/log-source';

export type LogEntry = {
  readonly index: number;
  readonly timeMilliseconds: number;
  readonly type: string;
  readonly message: string;
  readonly record: LogRecord;
};

export type TypeCount = {
  readonly name: string;
  readonly count: number;
};

export type LogTimeline = {
  readonly entries: readonly LogEntry[];
  readonly types: readonly TypeCount[];
  readonly skippedCount: number;
  readonly span: TimeRange | null;
};

export const messageTextOf = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

export const rankedTypeCountsOf = (names: readonly string[]): readonly TypeCount[] =>
  R.pipe(
    [...R.reduce(names, (counted, name) => counted.set(name, (counted.get(name) ?? 0) + 1), new Map<string, number>()).entries()],
    R.map(([name, count]) => ({ name, count })),
    R.sortBy((type) => severityRankOf(type.name), [(type) => type.count, 'desc']),
  );

export const placeableTypeCountsOf = (readings: readonly EntryReading[]): readonly TypeCount[] =>
  rankedTypeCountsOf(
    R.pipe(
      readings,
      R.filter(isPlaceable),
      R.map((reading) => reading.type),
    ),
  );

export const timelineOfReadings = (records: readonly LogRecord[], readings: readonly EntryReading[], texts: LogsMessages): LogTimeline => {
  const entries = R.pipe(
    readings,
    R.map((reading, position) => {
      const record = records[position];

      return reading.timeMilliseconds === null || record === undefined
        ? null
        : {
            timeMilliseconds: reading.timeMilliseconds,
            type: reading.type,
            message: isMissingValue(reading.message) ? texts.noMessage : messageTextOf(reading.message),
            record,
          };
    }),
    R.filter(R.isNonNullish),
    R.sortBy((entry) => entry.timeMilliseconds),
    R.map((entry, index) => ({ ...entry, index })),
  );

  const first = R.first(entries);
  const last = R.last(entries);

  return {
    entries,
    types: placeableTypeCountsOf(readings),
    skippedCount: records.length - entries.length,
    span: first === undefined || last === undefined ? null : { fromMilliseconds: first.timeMilliseconds, untilMilliseconds: last.timeMilliseconds },
  };
};

export const timelineOf = (records: readonly LogRecord[], mapping: LogMapping, texts: LogsMessages): LogTimeline =>
  timelineOfReadings(
    records,
    R.map(records, (record) => readEntryOf(record, mapping)),
    texts,
  );

export const entriesOfTypesShown = (entries: readonly LogEntry[], hiddenTypes: ReadonlySet<string>): readonly LogEntry[] =>
  hiddenTypes.size === 0 ? entries : R.filter(entries, (entry) => !hiddenTypes.has(entry.type));

export type ShownPosition = {
  readonly position: number;
  readonly isShown: boolean;
};

export const shownPositionOf = (shown: readonly LogEntry[], index: number): ShownPosition => {
  const position = R.sortedIndexWith(shown, (entry) => entry.index < index);

  return { position, isShown: shown[position]?.index === index };
};

export const steppedEntryOf = (shown: readonly LogEntry[], from: ShownPosition, step: number): LogEntry | undefined => {
  if (step < 0) {
    return shown[from.position - 1];
  }

  return shown[from.isShown ? from.position + 1 : from.position];
};
