import { describe, expect, it } from 'vitest';
import { LOG_FORMATS, logFormatOf } from './log-format';

describe('logFormatOf', () => {
  it('reads a .json, .jsonl or .ndjson file as JSON, whatever the case of its extension', () => {
    expect(logFormatOf('app.json')).toBe(LOG_FORMATS.JSON);
    expect(logFormatOf('app.JSONL')).toBe(LOG_FORMATS.JSON);
    expect(logFormatOf('events.ndjson')).toBe(LOG_FORMATS.JSON);
  });

  it('reads a .csv file as CSV', () => {
    expect(logFormatOf('export.2026-10-14.csv')).toBe(LOG_FORMATS.CSV);
  });

  it('reads a .log, a .txt or a file with no extension as text', () => {
    expect(logFormatOf('server.log')).toBe(LOG_FORMATS.TEXT);
    expect(logFormatOf('notes.txt')).toBe(LOG_FORMATS.TEXT);
    expect(logFormatOf('syslog')).toBe(LOG_FORMATS.TEXT);
  });
});
