import { describe, expect, it } from 'vitest';
import { parseCsvRows } from './log-csv';

describe('parseCsvRows', () => {
  it('names each cell after the column of the header row it sits under', () => {
    const source = 'timestamp,level,message\n2026-10-14T10:00:00Z,info,started\n2026-10-14T10:05:00Z,error,disk full\n';

    expect(parseCsvRows(source)).toEqual([
      { timestamp: '2026-10-14T10:00:00Z', level: 'info', message: 'started' },
      { timestamp: '2026-10-14T10:05:00Z', level: 'error', message: 'disk full' },
    ]);
  });

  it('reads a quoted cell holding the delimiter, a doubled quote and a line break as one value', () => {
    const source = 'time,message\r\n2026-10-14 10:00:00,"retry, then ""fail""\nat line 2"\r\n';

    expect(parseCsvRows(source)).toEqual([{ time: '2026-10-14 10:00:00', message: 'retry, then "fail"\nat line 2' }]);
  });

  it('parseCsvRows a quote that never closes carries every line after it into that one cell', () => {
    const source = 'time,message\n2026-10-14,"opened\nnever closed\n';

    const rows = parseCsvRows(source);

    expect(rows).toEqual([{ time: '2026-10-14', message: '"opened\nnever closed' }]);
  });

  it('takes semicolons or tabs as the delimiter when the header holds more of them than commas', () => {
    expect(parseCsvRows('time;message\n2026-10-14;a, b\n')).toEqual([{ time: '2026-10-14', message: 'a, b' }]);
    expect(parseCsvRows('time\tmessage\n2026-10-14\thello\n')).toEqual([{ time: '2026-10-14', message: 'hello' }]);
  });

  it('leaves empty cells out, names a column with no header after its position, and skips blank rows', () => {
    expect(parseCsvRows('time,,message\n2026-10-14,x,\n\n2026-10-15,,later\n')).toEqual([
      { time: '2026-10-14', 'column 2': 'x' },
      { time: '2026-10-15', message: 'later' },
    ]);
  });

  it('finds no rows in a file holding only a header, or nothing at all', () => {
    expect(parseCsvRows('time,message\n')).toEqual([]);
    expect(parseCsvRows('')).toEqual([]);
  });
});
