import { formatMessage, formatPlural, type LogsMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { parseCsvRows } from '../log-csv/log-csv';
import { LOG_FORMATS, type LogFormat } from '../log-format/log-format';
import { readPlainTextLog } from '../log-plain-text/log-plain-text';
import { parseLogTimestamp } from '../log-timestamp/log-timestamp';

export type LogRecord = Readonly<Record<string, unknown>>;

export type LogFailure = {
  readonly title: string;
  readonly detail: string;
};

export type ParsedLogs = {
  readonly records: readonly LogRecord[];
  readonly notes: readonly string[];
};

export type LogParsing = { readonly parsed: ParsedLogs; readonly failure: null } | { readonly parsed: null; readonly failure: LogFailure };

type JsonReading = { readonly value: unknown; readonly error: null } | { readonly value: null; readonly error: Error };

type ReadValues = {
  readonly values: readonly unknown[];
  readonly notes: readonly string[];
};

export const MAXIMUM_LOG_FILE_MEGABYTES = 25;
export const MAXIMUM_LOG_FILE_BYTES = MAXIMUM_LOG_FILE_MEGABYTES * 1024 * 1024;
export const LOG_FILE_ACCEPT = '.json,.jsonl,.ndjson,.log,.txt,.csv,application/json,text/plain,text/csv';

const BYTE_ORDER_MARK = /^﻿/;
const LINE_BREAK = /\r?\n/;
const ERROR_POSITION = /position (\d+)/;
const LINE_FEED = '\n';
const DECIMAL_RADIX = 10;
const TOLERATED_BAD_LINE_SHARE = 0.2;
const FAILURE_DETAIL_LENGTH = 180;
const NO_DETAIL = '';

export const isLogRecord = (value: unknown): value is LogRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

const isDated = (record: LogRecord): boolean => Object.values(record).some((value) => parseLogTimestamp(value) !== null);

const failed = (title: string, detail: string = NO_DETAIL): LogParsing => ({ parsed: null, failure: { title, detail } });

const readJson = (source: string): JsonReading => {
  try {
    const value: unknown = JSON.parse(source);

    return { value, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
};

const readLines = (source: string, texts: LogsMessages): ReadValues | null => {
  const lines = R.pipe(
    source.split(LINE_BREAK),
    R.map((text, index) => ({ text, number: index + 1 })),
    R.filter((line) => line.text.trim() !== ''),
  );

  const readings = R.map(lines, (line) => ({ ...readJson(line.text), number: line.number }));
  const firstBadReading = readings.find((reading) => reading.error !== null);

  const values = R.pipe(
    readings,
    R.filter((reading) => reading.error === null),
    R.map((reading) => reading.value),
  );

  const badCount = readings.length - values.length;

  if (lines.length < 2 || values.length === 0 || badCount > lines.length * TOLERATED_BAD_LINE_SHARE) {
    return null;
  }

  return { values, notes: firstBadReading === undefined ? [] : [formatPlural(texts.notes.skippedLines, badCount, { line: firstBadReading.number })] };
};

const invalidJson = (source: string, error: Error, texts: LogsMessages): LogParsing => {
  const position = ERROR_POSITION.exec(error.message)?.[1];
  const detail = error.message.slice(0, FAILURE_DETAIL_LENGTH);

  if (position === undefined) {
    return failed(texts.failures.invalidJson, detail);
  }

  const line = source.slice(0, Number.parseInt(position, DECIMAL_RADIX)).split(LINE_FEED).length;

  return failed(formatMessage(texts.failures.invalidJsonNearLine, { line }), detail);
};

const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const valuesOf = (document: unknown, texts: LogsMessages): ReadValues | null => {
  if (Array.isArray(document)) {
    return { values: document, notes: [] };
  }

  if (!isLogRecord(document)) {
    return null;
  }

  const holder = R.pipe(
    Object.entries(document),
    R.map(([name, value]) => {
      const values = listOf(value);

      return { name, values, held: R.filter(values, isLogRecord) };
    }),
    R.find((candidate) => candidate.held.length > 0),
  );

  if (holder === undefined || (isDated(document) && !holder.held.some(isDated))) {
    return { values: [document], notes: [] };
  }

  return { values: holder.values, notes: [formatMessage(texts.notes.arrayProperty, { name: holder.name })] };
};

const recordsOf = (read: ReadValues, texts: LogsMessages): LogParsing => {
  const records = R.filter(read.values, isLogRecord);
  const skippedCount = read.values.length - records.length;

  if (records.length === 0) {
    return failed(texts.failures.noObjects, skippedCount === 0 ? texts.failures.emptyArray : formatPlural(texts.failures.noObjectsDetail, skippedCount));
  }

  return {
    parsed: { records, notes: skippedCount === 0 ? read.notes : [...read.notes, formatPlural(texts.notes.skippedValues, skippedCount)] },
    failure: null,
  };
};

const parsedCsv = (source: string, texts: LogsMessages): LogParsing => {
  const records = parseCsvRows(source);

  return records.length === 0 ? failed(texts.failures.noCsvRows) : { parsed: { records, notes: [] }, failure: null };
};

const parsedPlainText = (source: string, texts: LogsMessages): LogParsing => {
  const { entries, undatedLineCount } = readPlainTextLog(source);

  if (entries.length === 0) {
    return failed(texts.failures.noDatedLines);
  }

  return { parsed: { records: entries, notes: undatedLineCount === 0 ? [] : [formatPlural(texts.notes.undatedLines, undatedLineCount)] }, failure: null };
};

const documentRecordsOf = (document: unknown, texts: LogsMessages): LogParsing => {
  const read = valuesOf(document, texts);

  return read === null ? failed(texts.failures.noObjects) : recordsOf(read, texts);
};

const parsedJson = (source: string, texts: LogsMessages): LogParsing => {
  const reading = readJson(source);

  if (reading.error === null) {
    return documentRecordsOf(reading.value, texts);
  }

  const lines = readLines(source, texts);

  return lines === null ? invalidJson(source, reading.error, texts) : recordsOf(lines, texts);
};

const parsedJsonOrPlainText = (source: string, texts: LogsMessages): LogParsing => {
  const reading = readJson(source);

  if (reading.error === null) {
    return documentRecordsOf(reading.value, texts);
  }

  const lines = readLines(source, texts);

  return lines === null ? parsedPlainText(source, texts) : recordsOf(lines, texts);
};

const PARSERS: Readonly<Record<LogFormat, (source: string, texts: LogsMessages) => LogParsing>> = {
  [LOG_FORMATS.JSON]: parsedJson,
  [LOG_FORMATS.CSV]: parsedCsv,
  [LOG_FORMATS.TEXT]: parsedJsonOrPlainText,
};

export const parseLogText = (text: string, texts: LogsMessages, format: LogFormat): LogParsing => {
  const source = text.replace(BYTE_ORDER_MARK, '');

  if (source.trim() === '') {
    return failed(texts.failures.empty);
  }

  return PARSERS[format](source, texts);
};
