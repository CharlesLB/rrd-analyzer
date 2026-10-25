import type { CanvasMessages, UnitMessages } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { formatValue } from '../../../../shared/utils/value-format/value-format.util';
import type { RangedLine } from '../../../../stores/workspace/models/value-axis/value-axis';
import { lastPresentOf, plotTopPercentOf, sampleAtFraction } from '../plot-geometry/plot-geometry';

type LineReading = {
  readonly line: RangedLine;
  readonly value: number | null;
};

export type ReadingTexts = {
  readonly canvas: CanvasMessages;
  readonly units: UnitMessages;
};

export type CrosshairReading = {
  readonly seriesId: string;
  readonly top: string;
  readonly color: string;
  readonly value: string;
};

export type LegendEntry = {
  readonly seriesId: string;
  readonly name: string;
  readonly color: string;
  readonly value: string;
  readonly isLive: boolean;
};

export type CursorReading = {
  readonly fraction: number;
  readonly time: string;
};

export const lineReadingsOf = (lines: readonly RangedLine[], cursor: CursorReading | null): readonly LineReading[] =>
  R.map(lines, (line) => ({ line, value: cursor === null ? lastPresentOf(line.samples) : sampleAtFraction(line.samples, cursor.fraction) }));

const formatReading = (reading: LineReading, texts: ReadingTexts): string =>
  reading.value === null ? texts.canvas.noData : formatValue(reading.value, reading.line.series.unit, texts.units);

export const crosshairReadingsOf = (readings: readonly LineReading[], cursor: CursorReading | null, texts: ReadingTexts): readonly CrosshairReading[] =>
  R.pipe(
    cursor === null ? [] : readings,
    R.map((reading) =>
      reading.value === null
        ? null
        : {
            seriesId: reading.line.series.id,
            top: plotTopPercentOf(reading.value, reading.line.range),
            color: reading.line.series.color,
            value: formatReading(reading, texts),
          },
    ),
    R.filter(R.isNonNullish),
  );

export const legendEntriesOf = (readings: readonly LineReading[], cursor: CursorReading | null, texts: ReadingTexts): readonly LegendEntry[] =>
  R.map(readings, (reading) => ({
    seriesId: reading.line.series.id,
    name: reading.line.series.name,
    color: reading.line.series.color,
    value: formatReading(reading, texts),
    isLive: cursor !== null && reading.value !== null,
  }));
