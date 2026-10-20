import * as R from 'remeda';

export type PlainTextEntry = Readonly<Record<string, string | number>>;

export type PlainTextReading = {
  readonly entries: readonly PlainTextEntry[];
  readonly undatedLineCount: number;
};

const LINE_BREAK = /\r?\n/;
// eslint-disable-next-line security/detect-unsafe-regex -- anchored at the start of the line, every repetition is bounded and every optional part opens on a character the part before it cannot end on, so a line is read in one pass
const LEADING_TIMESTAMP = /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)\]?/;
const LEADING_LEVEL = /^\[?(trace|debug|info|notice|warn|warning|error|err|fatal|critical|crit|panic)\]?(?=[\s:|-]|$)[\s:|-]*/i;
const LEADING_SEPARATORS = /^[\s:|-]+/;
const ENTRY_LINE_JOINER = '\n';

const FIELD_NAMES = {
  TIMESTAMP: 'timestamp',
  LEVEL: 'level',
  MESSAGE: 'message',
  LINE: 'line',
} as const;

const entryOf = (firstLine: string, continuation: readonly string[], lineNumber: number): PlainTextEntry => {
  const timestamp = LEADING_TIMESTAMP.exec(firstLine);
  const afterTimestamp = firstLine.slice(timestamp?.[0].length ?? 0).replace(LEADING_SEPARATORS, '');
  const level = LEADING_LEVEL.exec(afterTimestamp);
  const message = [afterTimestamp.slice(level?.[0].length ?? 0), ...continuation].join(ENTRY_LINE_JOINER).trimEnd();

  return {
    [FIELD_NAMES.TIMESTAMP]: timestamp?.[1] ?? '',
    ...(level?.[1] === undefined ? {} : { [FIELD_NAMES.LEVEL]: level[1] }),
    [FIELD_NAMES.MESSAGE]: message,
    [FIELD_NAMES.LINE]: lineNumber,
  };
};

export const readPlainTextLog = (source: string): PlainTextReading => {
  const lines = source.split(LINE_BREAK);
  const entryStarts = R.filter(R.range(0, lines.length), (index) => LEADING_TIMESTAMP.test(lines[index] ?? ''));
  const firstStart = R.first(entryStarts) ?? lines.length;
  const undatedLineCount = R.filter(lines.slice(0, firstStart), (line) => line.trim() !== '').length;

  const entries = R.map(entryStarts, (start, position) => {
    const end = entryStarts[position + 1] ?? lines.length;

    return entryOf(lines[start] ?? '', lines.slice(start + 1, end), start + 1);
  });

  return { entries, undatedLineCount };
};
