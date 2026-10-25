import * as R from 'remeda';

type PlainTextEntry = Readonly<Record<string, string | number>>;

type PlainTextReading = {
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

type DatedLine = {
  readonly index: number;
  readonly timestamp: RegExpExecArray;
};

const entryOf = (timestamp: RegExpExecArray, continuation: readonly string[], lineNumber: number): PlainTextEntry => {
  const afterTimestamp = timestamp.input.slice(timestamp[0].length).replace(LEADING_SEPARATORS, '');
  const level = LEADING_LEVEL.exec(afterTimestamp);
  const message = [afterTimestamp.slice(level?.[0].length ?? 0), ...continuation].join(ENTRY_LINE_JOINER).trimEnd();

  return {
    [FIELD_NAMES.TIMESTAMP]: timestamp[1],
    ...(level?.[1] === undefined ? {} : { [FIELD_NAMES.LEVEL]: level[1] }),
    [FIELD_NAMES.MESSAGE]: message,
    [FIELD_NAMES.LINE]: lineNumber,
  };
};

const datedLinesOf = (lines: readonly string[]): readonly DatedLine[] =>
  R.pipe(
    lines,
    R.map((line, index) => ({ index, timestamp: LEADING_TIMESTAMP.exec(line) })),
    R.filter((line): line is DatedLine => line.timestamp !== null),
  );

export const readPlainTextLog = (source: string): PlainTextReading => {
  const lines = source.split(LINE_BREAK);
  const datedLines = datedLinesOf(lines);
  const firstStart = R.first(datedLines)?.index ?? lines.length;
  const undatedLineCount = R.filter(lines.slice(0, firstStart), (line) => line.trim() !== '').length;

  const entries = R.map(datedLines, (datedLine, position) => {
    const end = datedLines[position + 1]?.index ?? lines.length;

    return entryOf(datedLine.timestamp, lines.slice(datedLine.index + 1, end), datedLine.index + 1);
  });

  return { entries, undatedLineCount };
};
