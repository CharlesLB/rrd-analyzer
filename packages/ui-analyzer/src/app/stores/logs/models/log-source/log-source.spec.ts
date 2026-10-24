import { messagesFor } from '@rrd-analyzer/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOG_FORMATS } from '../log-format/log-format';
import { parseLogText } from './log-source';

const texts = messagesFor().logs;

describe('parseLogText', () => {
  it('parseLogText, for an array of objects, reads every object as an entry', () => {
    const { parsed, failure } = parseLogText('[{"level":"info"},{"level":"warn"}]', texts, LOG_FORMATS.JSON);

    expect(failure).toBeNull();
    expect(parsed?.records).toEqual([{ level: 'info' }, { level: 'warn' }]);
    expect(parsed?.notes).toEqual([]);
  });

  it('parseLogText, for an object holding an array of objects, reads that array and names it', () => {
    const { parsed } = parseLogText('{"total":2,"tags":["a"],"logs":[{"level":"info"},{"level":"warn"}]}', texts, LOG_FORMATS.JSON);

    expect(parsed?.records).toHaveLength(2);
    expect(parsed?.notes).toEqual(['Entries were read from the “logs” array.']);
  });

  it('parseLogText, for one object per line, reads each line and skips the few that are broken', () => {
    const lines = ['{"n":1}', '{"n":2}', 'not json', '{"n":3}', '{"n":4}', '{"n":5}'];
    const { parsed } = parseLogText(lines.join('\n'), texts, LOG_FORMATS.JSON);

    expect(parsed?.records).toHaveLength(5);
    expect(parsed?.notes).toEqual(["1 line couldn't be parsed and was skipped (line 3)."]);
  });

  it('parseLogText, for lines set apart by blank ones, numbers a broken line as the file does', () => {
    const lines = ['', '{"n":1}', '', '{"n":2}', '{"n":3}', '', 'not json', '{"n":4}', '{"n":5}'];
    const { parsed } = parseLogText(lines.join('\n'), texts, LOG_FORMATS.JSON);

    expect(parsed?.notes).toEqual(["1 line couldn't be parsed and was skipped (line 7)."]);
  });

  it('parseLogText, for broken JSON after blank lines, counts them towards the line it points at', () => {
    const { failure } = parseLogText('\n\n[\n  {"level": "info" "message": "x"}\n]', texts, LOG_FORMATS.JSON);

    expect(failure?.title).toBe("This file isn't valid JSON near line 4.");
  });

  it('parseLogText, when more than a fifth of the lines are broken, refuses the file as invalid JSON', () => {
    const { parsed, failure } = parseLogText('{"n":1}\nnope\nnope again', texts, LOG_FORMATS.JSON);

    expect(parsed).toBeNull();
    expect(failure?.title).toContain("This file isn't valid JSON");
    expect(failure?.detail).not.toBe('');
  });

  it('parseLogText, for a single object, treats it as one entry', () => {
    expect(parseLogText('{"level":"info","message":"started"}', texts, LOG_FORMATS.JSON).parsed?.records).toEqual([{ level: 'info', message: 'started' }]);
  });

  it('parseLogText, for a single entry that lists objects of its own, treats it as one entry, not as a wrapper of them', () => {
    const entry = { time: '2026-08-29T10:24:00.000Z', level: 'error', message: 'batch failed', items: [{ id: 1 }, { id: 2 }] };
    const { parsed } = parseLogText(JSON.stringify(entry), texts, LOG_FORMATS.JSON);

    expect(parsed?.records).toEqual([entry]);
    expect(parsed?.notes).toEqual([]);
  });

  it('parseLogText, for a dated wrapper whose array holds dated entries, still reads the array', () => {
    const wrapper = {
      exportedAt: '2026-08-30T00:00:00.000Z',
      entries: [
        { time: '2026-08-29T10:24:00.000Z', level: 'error' },
        { time: '2026-08-29T10:25:00.000Z', level: 'info' },
      ],
    };

    const { parsed } = parseLogText(JSON.stringify(wrapper), texts, LOG_FORMATS.JSON);

    expect(parsed?.records).toEqual(wrapper.entries);
    expect(parsed?.notes).toEqual(['Entries were read from the “entries” array.']);
  });

  it('parseLogText, for values that are not objects, skips them and says how many', () => {
    const { parsed } = parseLogText('[{"n":1}, 7, "text", null, [1]]', texts, LOG_FORMATS.JSON);

    expect(parsed?.records).toEqual([{ n: 1 }]);
    expect(parsed?.notes).toEqual(['4 non-object values were skipped.']);
  });

  it('parseLogText, for an empty file, an empty array or a file with no objects, says what is missing', () => {
    expect(parseLogText(' \n ', texts, LOG_FORMATS.JSON).failure?.title).toBe('The file is empty.');
    expect(parseLogText('[]', texts, LOG_FORMATS.JSON).failure).toEqual({
      title: 'No log entries found — the file needs JSON objects.',
      detail: 'The array is empty.',
    });
    expect(parseLogText('[1, 2]', texts, LOG_FORMATS.JSON).failure?.detail).toBe('2 values were found, none of them objects.');
    expect(parseLogText('42', texts, LOG_FORMATS.JSON).failure?.title).toBe('No log entries found — the file needs JSON objects.');
  });

  it('parseLogText, for JSON broken on its second line, points at that line', () => {
    const { failure } = parseLogText('[\n  {"level": "info" "message": "x"}\n]', texts, LOG_FORMATS.JSON);

    expect(failure?.title).toBe("This file isn't valid JSON near line 2.");
  });

  it('parseLogText, for a file that starts with a byte order mark, reads past it', () => {
    expect(parseLogText('﻿[{"n":1}]', texts, LOG_FORMATS.JSON).parsed?.records).toEqual([{ n: 1 }]);
  });

  it('parseLogText, for JSON the parser rejects without naming a position, refuses it as invalid JSON with the parser message', () => {
    const { failure } = parseLogText('not json at all', texts, LOG_FORMATS.JSON);

    expect(failure?.title).toBe(texts.failures.invalidJson);
    expect(failure?.detail).toContain('is not valid JSON');
  });
});

describe('parseLogText when the parser throws something that is not an error', () => {
  const throwText = (): never => {
    throw 'unreadable';
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parseLogText, when the JSON parser throws a bare value, refuses the file with that value as the detail', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(throwText);

    const { failure } = parseLogText('{"level":"info"}', texts, LOG_FORMATS.JSON);

    expect(failure).toEqual({ title: texts.failures.invalidJson, detail: 'unreadable' });
  });
});

describe('parseLogText for a CSV or a text log', () => {
  it('parseLogText reads a CSV row by row under its header, and says when there is no row', () => {
    expect(parseLogText('time,level,message\n2026-10-14T10:00:00Z,info,up\n', texts, LOG_FORMATS.CSV).parsed?.records).toEqual([
      { time: '2026-10-14T10:00:00Z', level: 'info', message: 'up' },
    ]);
    expect(parseLogText('time,level,message\n', texts, LOG_FORMATS.CSV).failure?.title).toBe(
      'No log entries found: the CSV needs a header row and at least one row below it.',
    );
  });

  it('parseLogText reads a text log holding one JSON document as that document', () => {
    const { parsed } = parseLogText('[{"level":"info"},{"level":"warn"}]', texts, LOG_FORMATS.TEXT);

    expect(parsed).toEqual({ records: [{ level: 'info' }, { level: 'warn' }], notes: [] });
  });

  it('parseLogText reads a plain text log whose every line is dated without a note', () => {
    const { parsed } = parseLogText('2026-10-14T10:00:00Z INFO up\n', texts, LOG_FORMATS.TEXT);

    expect(parsed).toEqual({ records: [{ timestamp: '2026-10-14T10:00:00Z', level: 'INFO', message: 'up', line: 1 }], notes: [] });
  });

  it('parseLogText reads a text log holding newline-delimited JSON as JSON', () => {
    expect(parseLogText('{"level":"info"}\n{"level":"warn"}\n', texts, LOG_FORMATS.TEXT).parsed?.records).toEqual([{ level: 'info' }, { level: 'warn' }]);
  });

  it('parseLogText reads a plain text log line by line, noting the undated lines it skipped', () => {
    const { parsed } = parseLogText('boot banner\n2026-10-14T10:00:00Z INFO up\n2026-10-14T10:00:05Z ERROR down\n', texts, LOG_FORMATS.TEXT);

    expect(parsed?.records).toEqual([
      { timestamp: '2026-10-14T10:00:00Z', level: 'INFO', message: 'up', line: 2 },
      { timestamp: '2026-10-14T10:00:05Z', level: 'ERROR', message: 'down', line: 3 },
    ]);
    expect(parsed?.notes).toEqual(['1 line before the first dated entry was skipped.']);
  });

  it('parseLogText says a text log with no dated line holds no entry', () => {
    expect(parseLogText('just\nsome\nwords\n', texts, LOG_FORMATS.TEXT).failure?.title).toBe(
      'No log entries found: each entry needs to open on a date and time, such as 2026-10-14 10:00:00.',
    );
  });
});
