import * as R from 'remeda';

export type CsvRow = Readonly<Record<string, string>>;

type CsvDialect = {
  readonly delimiter: string;
  readonly field: RegExp;
};

const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const LINE_BREAK = /\r?\n/;
const ROW_JOINER = '\n';
const PAIR = 2;
const UNNAMED_COLUMN_PREFIX = 'column ';

const COMMA_FIELD = /(?:^|,)("(?:[^"]|"")*"|[^,]*)/g;
const SEMICOLON_FIELD = /(?:^|;)("(?:[^"]|"")*"|[^;]*)/g;
const TAB_FIELD = /(?:^|\t)("(?:[^"]|"")*"|[^\t]*)/g;

const COMMA_DIALECT: CsvDialect = { delimiter: ',', field: COMMA_FIELD };

const DIALECTS: readonly CsvDialect[] = [COMMA_DIALECT, { delimiter: ';', field: SEMICOLON_FIELD }, { delimiter: '\t', field: TAB_FIELD }];

const occurrencesIn = (text: string, character: string): number => text.split(character).length - 1;

const dialectOf = (source: string): CsvDialect => {
  const header = source.split(LINE_BREAK, 1)[0] ?? '';

  return R.firstBy(DIALECTS, [(dialect) => occurrencesIn(header, dialect.delimiter), 'desc']) ?? COMMA_DIALECT;
};

const unquoted = (field: string): string => {
  const trimmed = field.trim();

  return trimmed.startsWith(QUOTE) && trimmed.endsWith(QUOTE) && trimmed.length > 1 ? trimmed.slice(1, -1).replaceAll(ESCAPED_QUOTE, QUOTE) : trimmed;
};

const opensOrClosesAQuote = (line: string): boolean => occurrencesIn(line, QUOTE) % PAIR === 1;

const continuedLinesOf = (lines: readonly string[]): ReadonlySet<number> => {
  const quoteEdges = R.pipe(
    lines,
    R.map((line, index) => (opensOrClosesAQuote(line) ? index : null)),
    R.filter(R.isNonNullish),
  );

  return new Set(R.flatMap(R.chunk(quoteEdges, PAIR), ([opening, closing]) => R.range(opening + 1, (closing ?? lines.length - 1) + 1)));
};

const rowsOf = (source: string): readonly string[] => {
  const lines = source.split(LINE_BREAK);
  const continued = continuedLinesOf(lines);
  const rowStarts = R.filter(R.range(0, lines.length), (index) => !continued.has(index));

  return R.pipe(
    rowStarts,
    R.map((start, position) => lines.slice(start, rowStarts[position + 1] ?? lines.length).join(ROW_JOINER)),
    R.filter((row) => row.trim() !== ''),
  );
};

const fieldsOf = (row: string, dialect: CsvDialect): readonly string[] => Array.from(row.matchAll(dialect.field), (match) => unquoted(match[1] ?? ''));

const columnNamesOf = (header: readonly string[]): readonly string[] =>
  R.map(header, (name, index) => (name === '' ? `${UNNAMED_COLUMN_PREFIX}${index + 1}` : name));

const recordOf = (columnNames: readonly string[], cells: readonly string[]): CsvRow =>
  R.pipe(
    R.zip(columnNames, cells),
    R.filter(([, cell]) => cell !== ''),
    R.fromEntries(),
  );

export const parseCsvRows = (source: string): readonly CsvRow[] => {
  const dialect = dialectOf(source);
  const [header, ...rows] = R.map(rowsOf(source), (row) => fieldsOf(row, dialect));

  if (header === undefined) {
    return [];
  }

  const columnNames = columnNamesOf(header);

  return R.pipe(
    rows,
    R.map((cells) => recordOf(columnNames, cells)),
    R.filter((record) => Object.keys(record).length > 0),
  );
};
