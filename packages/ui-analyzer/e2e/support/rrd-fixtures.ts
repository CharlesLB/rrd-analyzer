import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { WORKER_SUFFIX } from './daemon';

const FIXTURE_DIRECTORY = `${process.env['TMPDIR'] ?? '/tmp'}/rrd-analyzer-e2e-fixtures${WORKER_SUFFIX}`;

const ANCHOR_SECONDS = 1_788_026_400;
const STEP_SECONDS = 300;
const SECONDS_PER_DAY = 86_400;
const FINE_ROWS = 480;
const DAILY_POINTS_PER_ROW = SECONDS_PER_DAY / STEP_SECONDS;
const UNKNOWN_VALUE = 'NaN';

const NOISE_MULTIPLIER = 1_664_525;
const NOISE_INCREMENT = 1_013_904_223;
const NOISE_MODULUS = 4_294_967_296;
const NOISE_SPREAD = 7919;
const NOISE_OFFSET = 13;
const WAVE_PERIOD_ROWS = 9;

export type ConsolidationName = 'AVERAGE' | 'MIN' | 'MAX' | 'LAST' | 'HWPREDICT';

export type ArchiveShape = {
  readonly consolidationFunction: ConsolidationName;
  readonly primaryPointsPerRow: number;
  readonly rows: number;
  readonly scale: number;
};

export type DataSourceShape = {
  readonly name: string;
  readonly type: 'GAUGE' | 'COUNTER' | 'DERIVE' | 'ABSOLUTE';
};

export type UnknownRange = {
  readonly fromRow: number;
  readonly untilRow: number;
};

export type RrdFixture = {
  readonly fileName: string;
  readonly dataSources: readonly DataSourceShape[];
  readonly archives: readonly ArchiveShape[];
  readonly baseline: number;
  readonly amplitude: number;
  readonly unknownRows: UnknownRange | null;
  readonly truncatedRows?: UnknownRange;
};

export type BrokenSource = {
  readonly fileName: string;
  readonly content: string;
};

export type WrittenSource = {
  readonly name: string;
  readonly path: string;
  readonly size: number;
};

const fineAverage: ArchiveShape = { consolidationFunction: 'AVERAGE', primaryPointsPerRow: 1, rows: FINE_ROWS, scale: 1 };

export const RRD_FIXTURES: readonly RrdFixture[] = [
  {
    fileName: 'atlas_cpu.xml',
    dataSources: [
      { name: 'user', type: 'GAUGE' },
      { name: 'system', type: 'GAUGE' },
    ],
    archives: [
      fineAverage,
      { consolidationFunction: 'MIN', primaryPointsPerRow: 1, rows: FINE_ROWS, scale: 0.55 },
      { consolidationFunction: 'MAX', primaryPointsPerRow: 1, rows: FINE_ROWS, scale: 1.85 },
    ],
    baseline: 42,
    amplitude: 16,
    unknownRows: null,
  },
  {
    fileName: 'atlas_traffic.xml',
    dataSources: [
      { name: 'in', type: 'COUNTER' },
      { name: 'out', type: 'COUNTER' },
    ],
    archives: [fineAverage],
    baseline: 9_400,
    amplitude: 3_200,
    unknownRows: null,
  },
  {
    fileName: 'atlas_disk_io.xml',
    dataSources: [{ name: 'ops', type: 'DERIVE' }],
    archives: [fineAverage],
    baseline: 620,
    amplitude: 240,
    unknownRows: null,
  },
  {
    fileName: 'atlas_latency.rrd',
    dataSources: [{ name: 'p95', type: 'GAUGE' }],
    archives: [fineAverage],
    baseline: 180,
    amplitude: 70,
    unknownRows: { fromRow: 300, untilRow: 344 },
  },
  {
    fileName: 'temperature.xml',
    dataSources: [{ name: 'celsius', type: 'GAUGE' }],
    archives: [fineAverage],
    baseline: 21,
    amplitude: 4,
    unknownRows: null,
  },
  {
    fileName: 'atlas_memory.xml',
    dataSources: [{ name: 'used', type: 'GAUGE' }],
    archives: [{ consolidationFunction: 'AVERAGE', primaryPointsPerRow: DAILY_POINTS_PER_ROW, rows: 40, scale: 0.92 }, fineAverage],
    baseline: 5.4e9,
    amplitude: 6e8,
    unknownRows: null,
  },
  {
    fileName: 'atlas_net.xml',
    dataSources: [
      { name: 'eth0.rx-bytes', type: 'COUNTER' },
      { name: 'eth0 tx/bytes', type: 'GAUGE' },
    ],
    archives: [fineAverage],
    baseline: 800,
    amplitude: 200,
    unknownRows: null,
  },
  {
    fileName: '---.xml',
    dataSources: [{ name: 'value', type: 'GAUGE' }],
    archives: [fineAverage],
    baseline: 12,
    amplitude: 3,
    unknownRows: null,
  },
  {
    fileName: 'atlas_forecast.xml',
    dataSources: [{ name: 'load', type: 'GAUGE' }],
    archives: [fineAverage, { consolidationFunction: 'HWPREDICT', primaryPointsPerRow: 1, rows: FINE_ROWS, scale: 40 }],
    baseline: 5,
    amplitude: 2,
    unknownRows: null,
  },
  {
    fileName: 'atlas_pair.xml',
    dataSources: [
      { name: 'hits', type: 'ABSOLUTE' },
      { name: 'misses', type: 'GAUGE' },
    ],
    archives: [fineAverage],
    baseline: 300,
    amplitude: 90,
    unknownRows: null,
    truncatedRows: { fromRow: 400, untilRow: 460 },
  },
];

const noiseAt = (seed: number, index: number): number =>
  (((seed * NOISE_SPREAD + index + NOISE_OFFSET) * NOISE_MULTIPLIER + NOISE_INCREMENT) % NOISE_MODULUS) / NOISE_MODULUS - 0.5;

const isWithin = (range: UnknownRange | null | undefined, rowIndex: number): boolean =>
  range !== null && range !== undefined && rowIndex >= range.fromRow && rowIndex < range.untilRow;

const isUnknownAt = (fixture: RrdFixture, rowIndex: number): boolean => isWithin(fixture.unknownRows, rowIndex);

const valueAt = (fixture: RrdFixture, archive: ArchiveShape, dataSourceIndex: number, rowIndex: number): string => {
  if (isUnknownAt(fixture, rowIndex)) {
    return UNKNOWN_VALUE;
  }

  const seed = dataSourceIndex + 1;
  const wave = Math.sin(rowIndex / WAVE_PERIOD_ROWS);
  const drift = noiseAt(seed, rowIndex);
  const perSourceScale = 1 - dataSourceIndex * 0.35;
  const value = (fixture.baseline + fixture.amplitude * (wave + drift)) * perSourceScale * archive.scale;

  return Math.max(0, value).toExponential(10);
};

const rowOf = (fixture: RrdFixture, archive: ArchiveShape, rowIndex: number): string => {
  const endSeconds = ANCHOR_SECONDS - (archive.rows - 1 - rowIndex) * archive.primaryPointsPerRow * STEP_SECONDS;
  const writtenSources = isWithin(fixture.truncatedRows, rowIndex) ? fixture.dataSources.slice(0, 1) : fixture.dataSources;
  const values = writtenSources.map((_source, index) => `<v>${valueAt(fixture, archive, index, rowIndex)}</v>`).join('');

  return `\t\t\t<!-- ${new Date(endSeconds * 1000).toISOString()} / ${endSeconds} --> <row>${values}</row>`;
};

const preparedDataSourceOf = (): string =>
  '\t\t\t<ds><primary_value>NaN</primary_value><secondary_value>NaN</secondary_value><value>NaN</value><unknown_datapoints>0</unknown_datapoints></ds>';

const archiveOf = (fixture: RrdFixture, archive: ArchiveShape): string => {
  const rows = Array.from({ length: archive.rows }, (_unused, rowIndex) => rowOf(fixture, archive, rowIndex)).join('\n');
  const prepared = fixture.dataSources.map(preparedDataSourceOf).join('\n');

  return [
    '\t<rra>',
    `\t\t<cf>${archive.consolidationFunction}</cf>`,
    `\t\t<pdp_per_row>${archive.primaryPointsPerRow}</pdp_per_row>`,
    '\t\t<params><xff>5.0000000000e-01</xff></params>',
    '\t\t<cdp_prep>',
    prepared,
    '\t\t</cdp_prep>',
    '\t\t<database>',
    rows,
    '\t\t</database>',
    '\t</rra>',
  ].join('\n');
};

const dataSourceOf = (source: DataSourceShape): string =>
  [
    '\t<ds>',
    `\t\t<name> ${source.name} </name>`,
    `\t\t<type> ${source.type} </type>`,
    '\t\t<minimal_heartbeat>600</minimal_heartbeat>',
    '\t\t<min>0.0000000000e+00</min>',
    '\t\t<max>NaN</max>',
    '\t\t<last_ds>0</last_ds>',
    '\t\t<value>0.0000000000e+00</value>',
    '\t\t<unknown_sec> 0 </unknown_sec>',
    '\t</ds>',
  ].join('\n');

export const dumpOf = (fixture: RrdFixture): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!DOCTYPE rrd SYSTEM "http://oss.oetiker.ch/rrdtool/rrdtool.dtd">',
    '<!-- Round Robin Database Dump -->',
    '<rrd>',
    '\t<version>0003</version>',
    `\t<step>${STEP_SECONDS}</step>`,
    `\t<lastupdate>${ANCHOR_SECONDS}</lastupdate>`,
    '',
    fixture.dataSources.map(dataSourceOf).join('\n'),
    '',
    fixture.archives.map((archive) => archiveOf(fixture, archive)).join('\n'),
    '</rrd>',
    '',
  ].join('\n');

const BINARY_COOKIE = 'RRD\0';
const BINARY_VERSION = '0003\0';
const BINARY_FLOAT_COOKIE = 8.642135e130;

const HEADER_SIZE = 128;
const DATA_SOURCE_SIZE = 120;
const ARCHIVE_SIZE = 120;
const LIVE_HEADER_SIZE = 16;
const PREPARED_DATA_SOURCE_SIZE = 112;
const PREPARED_ARCHIVE_SIZE = 80;
const POINTER_SIZE = 8;
const WORD_SIZE = 8;
const NAME_SIZE = 20;

const FLOAT_COOKIE_OFFSET = 16;
const DATA_SOURCE_COUNT_OFFSET = 24;
const ARCHIVE_COUNT_OFFSET = 32;
const STEP_OFFSET = 40;
const ARCHIVE_ROW_COUNT_OFFSET = 24;
const ARCHIVE_POINTS_PER_ROW_OFFSET = 32;

const BINARY_ROTATION = 137;

export type BinaryArchiveShape = {
  readonly consolidationFunction: ConsolidationName;
  readonly primaryPointsPerRow: number;
  readonly rows: number;
};

export type BinaryRrdFixture = {
  readonly fileName: string;
  readonly dataSource: DataSourceShape;
  readonly archives: readonly BinaryArchiveShape[];
  readonly baseline: number;
  readonly amplitude: number;
};

export const BINARY_RRD_FIXTURE: BinaryRrdFixture = {
  fileName: 'atlas_node_load.rrd',
  dataSource: { name: 'value', type: 'GAUGE' },
  archives: [
    { consolidationFunction: 'AVERAGE', primaryPointsPerRow: 1, rows: FINE_ROWS },
    { consolidationFunction: 'AVERAGE', primaryPointsPerRow: DAILY_POINTS_PER_ROW, rows: 40 },
  ],
  baseline: 2.4,
  amplitude: 1.1,
};

export const FIXTURE_FILE_NAMES: readonly string[] = [...RRD_FIXTURES.map((fixture) => fixture.fileName), BINARY_RRD_FIXTURE.fileName];

const binaryValueAt = (fixture: BinaryRrdFixture, rowIndex: number): number =>
  Math.max(0, fixture.baseline + fixture.amplitude * (Math.sin(rowIndex / WAVE_PERIOD_ROWS) + noiseAt(1, rowIndex)));

// The rows of a round robin archive live in a ring that starts wherever the writer last stopped,
// so the fixture is written rotated: a reader that ignores the pointer produces a sawtooth here
// instead of the wave the values describe.
const binaryDumpOf = (fixture: BinaryRrdFixture): Buffer => {
  const totalRows = fixture.archives.reduce((count, archive) => count + archive.rows, 0);

  const dataOffset =
    HEADER_SIZE +
    DATA_SOURCE_SIZE +
    fixture.archives.length * ARCHIVE_SIZE +
    LIVE_HEADER_SIZE +
    PREPARED_DATA_SOURCE_SIZE +
    fixture.archives.length * PREPARED_ARCHIVE_SIZE +
    fixture.archives.length * POINTER_SIZE;

  const content = Buffer.alloc(dataOffset + totalRows * WORD_SIZE);

  content.write(BINARY_COOKIE, 0, 'latin1');
  content.write(BINARY_VERSION, BINARY_COOKIE.length, 'latin1');
  content.writeDoubleLE(BINARY_FLOAT_COOKIE, FLOAT_COOKIE_OFFSET);
  content.writeBigUInt64LE(1n, DATA_SOURCE_COUNT_OFFSET);
  content.writeBigUInt64LE(BigInt(fixture.archives.length), ARCHIVE_COUNT_OFFSET);
  content.writeBigUInt64LE(BigInt(STEP_SECONDS), STEP_OFFSET);
  content.write(fixture.dataSource.name, HEADER_SIZE, 'latin1');
  content.write(fixture.dataSource.type, HEADER_SIZE + NAME_SIZE, 'latin1');

  const archiveOffset = HEADER_SIZE + DATA_SOURCE_SIZE;

  fixture.archives.forEach((archive, index) => {
    const base = archiveOffset + index * ARCHIVE_SIZE;

    content.write(archive.consolidationFunction, base, 'latin1');
    content.writeBigUInt64LE(BigInt(archive.rows), base + ARCHIVE_ROW_COUNT_OFFSET);
    content.writeBigUInt64LE(BigInt(archive.primaryPointsPerRow), base + ARCHIVE_POINTS_PER_ROW_OFFSET);
  });

  const liveHeaderOffset = archiveOffset + fixture.archives.length * ARCHIVE_SIZE;
  content.writeBigUInt64LE(BigInt(ANCHOR_SECONDS), liveHeaderOffset);

  const pointerOffset = liveHeaderOffset + LIVE_HEADER_SIZE + PREPARED_DATA_SOURCE_SIZE + fixture.archives.length * PREPARED_ARCHIVE_SIZE;

  fixture.archives.reduce((cursor, archive, index) => {
    const newest = (archive.rows - 1 + BINARY_ROTATION) % archive.rows;

    content.writeBigUInt64LE(BigInt(newest), pointerOffset + index * POINTER_SIZE);

    Array.from({ length: archive.rows }, (_unused, rowIndex) => rowIndex).forEach((rowIndex) => {
      const stored = (rowIndex + BINARY_ROTATION) % archive.rows;

      content.writeDoubleLE(binaryValueAt(fixture, rowIndex), cursor + stored * WORD_SIZE);
    });

    return cursor + archive.rows * WORD_SIZE;
  }, dataOffset);

  return content;
};

export const writeRrdFixtures = (): readonly WrittenSource[] => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is this module's own constant, never a value from a page or a request
  mkdirSync(FIXTURE_DIRECTORY, { recursive: true });

  const written = RRD_FIXTURES.map((fixture) => {
    const path = `${FIXTURE_DIRECTORY}/${fixture.fileName}`;
    const dump = dumpOf(fixture);

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is built from RRD_FIXTURES above, which is a literal catalogue in this file
    writeFileSync(path, dump, 'utf8');

    return { name: fixture.fileName, path, size: Buffer.byteLength(dump, 'utf8') };
  });

  const binaryPath = `${FIXTURE_DIRECTORY}/${BINARY_RRD_FIXTURE.fileName}`;
  const binaryDump = binaryDumpOf(BINARY_RRD_FIXTURE);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is built from BINARY_RRD_FIXTURE above, which is a literal in this file
  writeFileSync(binaryPath, binaryDump);

  return [...written, { name: BINARY_RRD_FIXTURE.fileName, path: binaryPath, size: binaryDump.length }];
};

const emptyArchiveFixture: RrdFixture = {
  fileName: 'no_rows.xml',
  dataSources: [{ name: 'value', type: 'GAUGE' }],
  archives: [{ consolidationFunction: 'AVERAGE', primaryPointsPerRow: 1, rows: 0, scale: 1 }],
  baseline: 1,
  amplitude: 1,
  unknownRows: null,
};

const noDataSourceFixture: RrdFixture = { ...emptyArchiveFixture, fileName: 'no_data_sources.xml', dataSources: [] };

const CUT_SHORT_LENGTH = 320;

export const BROKEN_SOURCES = {
  NOT_A_DATABASE: { fileName: 'saved_from_an_editor.rrd', content: 'this text was saved under an .rrd name by mistake' },
  EMPTY_ARCHIVE: { fileName: emptyArchiveFixture.fileName, content: dumpOf(emptyArchiveFixture) },
  NO_DATA_SOURCES: { fileName: noDataSourceFixture.fileName, content: dumpOf(noDataSourceFixture) },
  CUT_SHORT: { fileName: 'cut_short.xml', content: dumpOf(RRD_FIXTURES[0]).slice(0, CUT_SHORT_LENGTH) },
} as const satisfies Readonly<Record<string, BrokenSource>>;

export const writeBrokenSources = (): readonly WrittenSource[] => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the directory is this module's own constant, never a value from a page or a request
  mkdirSync(FIXTURE_DIRECTORY, { recursive: true });

  return Object.values(BROKEN_SOURCES).map((broken) => {
    const path = `${FIXTURE_DIRECTORY}/${broken.fileName}`;

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is built from BROKEN_SOURCES above, which is a literal catalogue in this file
    writeFileSync(path, broken.content, 'utf8');

    return { name: broken.fileName, path, size: Buffer.byteLength(broken.content, 'utf8') };
  });
};

export const MISSING_SOURCE: WrittenSource = { name: 'deleted_since.xml', path: `${FIXTURE_DIRECTORY}/deleted_since.xml`, size: 2048 };

export type RestorableSource = {
  readonly source: WrittenSource;
  readonly restore: () => void;
};

const RESTORABLE_PREFIX = 'put_back_';

export const restorableSourceOf = (original: WrittenSource): RestorableSource => {
  const name = `${RESTORABLE_PREFIX}${original.name}`;
  const path = `${FIXTURE_DIRECTORY}/${name}`;

  rmSync(path, { force: true });

  return {
    source: { ...original, name, path },
    restore: () => copyFileSync(original.path, path),
  };
};

export const sourcesNamed = (written: readonly WrittenSource[], fileNames: readonly string[]): readonly WrittenSource[] =>
  fileNames.map((fileName) => {
    const found = written.find((source) => source.name === fileName);

    if (found === undefined) {
      throw new Error(`no rrd fixture is called ${fileName}`);
    }

    return found;
  });
