import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { CPU_USER_SERIES, MEMORY_USED_SERIES } from '../../../../stores/workspace/models/series/series.fixture';
import { rangedLinesOf, valueAxesOf } from '../../../../stores/workspace/models/value-axis/value-axis';
import { crosshairReadingsOf, legendEntriesOf, lineReadingsOf } from './chart-reading';

const messages = messagesFor();
const texts = { canvas: messages.canvas, units: messages.units };

const chartLines = [
  { series: CPU_USER_SERIES, samples: [10, 20, null, 40], axis: 0 },
  { series: MEMORY_USED_SERIES, samples: [2e9, null, null, null], axis: 1 },
];

const lines = rangedLinesOf(chartLines, valueAxesOf(chartLines));
const CURSOR = { fraction: 0, time: '28/08 15:00' };

describe('lineReadingsOf', () => {
  it('lineReadingsOf reads each line under the cursor, or at its last reading when there is no cursor', () => {
    expect(lineReadingsOf(lines, CURSOR).map((reading) => reading.value)).toEqual([10, 2e9]);
    expect(lineReadingsOf(lines, null).map((reading) => reading.value)).toEqual([40, 2e9]);
    expect(lineReadingsOf(lines, { ...CURSOR, fraction: 0.66 }).map((reading) => reading.value)).toEqual([null, null]);
  });
});

describe('crosshairReadingsOf', () => {
  it('crosshairReadingsOf marks every line with a reading under the cursor, and nothing without a cursor', () => {
    const readings = crosshairReadingsOf(lineReadingsOf(lines, CURSOR), CURSOR, texts);

    expect(readings.map((reading) => [reading.seriesId, reading.value])).toEqual([
      [CPU_USER_SERIES.id, '10.0%'],
      [MEMORY_USED_SERIES.id, '1.86 GiB'],
    ]);
    expect(crosshairReadingsOf(lineReadingsOf(lines, null), null, texts)).toEqual([]);
  });
});

describe('legendEntriesOf', () => {
  it('legendEntriesOf names every line with its reading, live only while the cursor reads a value', () => {
    const atCursor = legendEntriesOf(lineReadingsOf(lines, { ...CURSOR, fraction: 0.66 }), CURSOR, texts);
    const atRest = legendEntriesOf(lineReadingsOf(lines, null), null, texts);

    expect(atCursor.map((entry) => [entry.value, entry.isLive])).toEqual([
      ['no data', false],
      ['no data', false],
    ]);
    expect(atRest.map((entry) => [entry.name, entry.value, entry.isLive])).toEqual([
      [CPU_USER_SERIES.name, '40.0%', false],
      [MEMORY_USED_SERIES.name, '1.86 GiB', false],
    ]);
  });
});
