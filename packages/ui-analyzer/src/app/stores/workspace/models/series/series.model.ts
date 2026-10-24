import * as R from 'remeda';
import type { Canvas, PlottedChart } from '../plotted-chart/plotted-chart';
import type { StatisticKey } from '../statistic-key/statistic-key';

export type Series = {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly label: string;
  readonly unit: string;
  readonly color: string;
  readonly stepMilliseconds: number;
};

export type SeriesSample = number | null;

export type SeriesStatistics = {
  readonly minimum: number;
  readonly maximum: number;
  readonly average: number;
  readonly percentile95: number;
  readonly last: number;
  readonly gapCount: number;
};

export type SeriesBundle = {
  readonly analysisId: string;
  readonly analysisName: string;
  readonly series: readonly Series[];
  readonly canvas: Canvas;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
};

export type SampleTracks = Readonly<Record<string, readonly SeriesSample[]>>;

type SeriesTrack = {
  readonly seriesId: string;
  readonly samples: readonly SeriesSample[];
};

export const tracksOf = (tracks: readonly SeriesTrack[]): SampleTracks => Object.fromEntries(R.map(tracks, (track) => [track.seriesId, track.samples]));

type StatisticsBySeries = Readonly<Record<string, SeriesStatistics | null>>;

export type ChartData = {
  readonly tracks: SampleTracks;
  readonly statistics: StatisticsBySeries;
};

export type PlottedLine = {
  readonly series: Series;
  readonly axis: number;
};

export type SampledLine = PlottedLine & {
  readonly samples: readonly SeriesSample[];
};

export type ChartLine = SampledLine & {
  readonly statistics: SeriesStatistics | null;
};

export const haveSameLines = (left: readonly ChartLine[], right: readonly ChartLine[]): boolean =>
  left.length === right.length && left.every((line, index) => R.isShallowEqual(line, right[index]));

export type CanvasChart = {
  readonly id: string;
  readonly lines: readonly ChartLine[];
  readonly referenceLines: readonly StatisticKey[];
};

export type CanvasOverview = {
  readonly samples: readonly SeriesSample[];
  readonly color: string;
};

export type LibraryEntry = {
  readonly series: Series;
  readonly samples: readonly SeriesSample[];
  readonly isOnCanvas: boolean;
  readonly isActive: boolean;
};

export const seriesFor = (seriesIds: readonly string[], seriesById: ReadonlyMap<string, Series>): readonly Series[] =>
  R.pipe(
    seriesIds,
    R.map((seriesId) => seriesById.get(seriesId)),
    R.filter(R.isNonNullish),
  );

export const withSeriesRecolored = (library: readonly Series[], seriesId: string, color: string): readonly Series[] =>
  R.map(library, (series) => (series.id === seriesId ? { ...series, color } : series));

export const seriesNameOf = (seriesById: ReadonlyMap<string, Series>, seriesId: string): string => seriesById.get(seriesId)?.name ?? seriesId;

export const plottedLinesOf = (chart: PlottedChart, seriesById: ReadonlyMap<string, Series>): readonly PlottedLine[] =>
  R.pipe(
    chart.plotted,
    R.map((entry) => {
      const series = seriesById.get(entry.seriesId);

      return series === undefined ? null : { series, axis: entry.axis };
    }),
    R.filter(R.isNonNullish),
  );

export const seriesIdsOfLines = (charts: readonly { readonly lines: readonly PlottedLine[] }[]): readonly string[] =>
  R.flatMap(charts, (chart) => R.map(chart.lines, (line) => line.series.id));

export const chartTitleOf = (lines: readonly PlottedLine[], separator: string): string => R.map(lines, (line) => line.series.name).join(separator);
