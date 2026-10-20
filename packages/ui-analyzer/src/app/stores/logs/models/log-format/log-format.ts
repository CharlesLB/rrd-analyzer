import type { ValueOf } from '../../../../shared/types/value-of';

export const LOG_FORMATS = {
  JSON: 'json',
  CSV: 'csv',
  TEXT: 'text',
} as const;

export type LogFormat = ValueOf<typeof LOG_FORMATS>;

const EXTENSION_SEPARATOR = '.';
const NO_EXTENSION = '';

const FORMAT_OF_EXTENSION: Readonly<Record<string, LogFormat>> = {
  json: LOG_FORMATS.JSON,
  jsonl: LOG_FORMATS.JSON,
  ndjson: LOG_FORMATS.JSON,
  csv: LOG_FORMATS.CSV,
};

const extensionOf = (fileName: string): string => {
  const separatorIndex = fileName.lastIndexOf(EXTENSION_SEPARATOR);

  return separatorIndex === -1 ? NO_EXTENSION : fileName.slice(separatorIndex + 1).toLowerCase();
};

export const logFormatOf = (fileName: string): LogFormat => FORMAT_OF_EXTENSION[extensionOf(fileName)] ?? LOG_FORMATS.TEXT;
