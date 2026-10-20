import { describe, expect, it } from 'vitest';
import { readPlainTextLog } from './log-plain-text';

describe('readPlainTextLog', () => {
  it('reads each line that opens on a date and time as an entry, with the level that follows it and the rest as its message', () => {
    const source = '2026-10-14T10:00:00Z INFO server started\n2026-10-14 10:05:00,123 [ERROR] disk full: /var\n';

    expect(readPlainTextLog(source)).toEqual({
      entries: [
        { timestamp: '2026-10-14T10:00:00Z', level: 'INFO', message: 'server started', line: 1 },
        { timestamp: '2026-10-14 10:05:00,123', level: 'ERROR', message: 'disk full: /var', line: 2 },
      ],
      undatedLineCount: 0,
    });
  });

  it('reads a bracketed date and a level followed by a colon, and leaves the level out when none is written', () => {
    expect(readPlainTextLog('[2026-10-14 10:00:00] warn: slow query\n2026-10-14 10:01:00 - informational note\n').entries).toEqual([
      { timestamp: '2026-10-14 10:00:00', level: 'warn', message: 'slow query', line: 1 },
      { timestamp: '2026-10-14 10:01:00', message: 'informational note', line: 2 },
    ]);
  });

  it('keeps the lines after an entry that open on no date, such as a stack trace, in that entry’s message', () => {
    const source = '2026-10-14T10:00:00Z ERROR boom\n    at handler (app.js:10)\n    at main (app.js:2)\n2026-10-14T10:00:01Z INFO recovered\n';

    expect(readPlainTextLog(source).entries[0]?.['message']).toBe('boom\n    at handler (app.js:10)\n    at main (app.js:2)');
    expect(readPlainTextLog(source).entries).toHaveLength(2);
  });

  it('counts the lines before the first dated one, which belong to no entry', () => {
    expect(readPlainTextLog('log opened\n\nby host-1\n2026-10-14T10:00:00Z INFO up\n').undatedLineCount).toBe(2);
  });

  it('finds no entry in text with no date at the start of any line', () => {
    expect(readPlainTextLog('hello\nworld\n')).toEqual({ entries: [], undatedLineCount: 2 });
  });
});
