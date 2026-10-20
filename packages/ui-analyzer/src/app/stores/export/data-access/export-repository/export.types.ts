import type { SampleTracks } from '../../../workspace/models/series/series.model';

export type TrackQuery = {
  readonly analysisId: string;
  readonly seriesIds: readonly string[];
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly columns: number;
};

export type TrackReader = (query: TrackQuery) => Promise<SampleTracks>;

export type CsvExportQuery = Omit<TrackQuery, 'columns'>;

export type CsvExportOutcome = {
  readonly isCancelled: boolean;
  readonly sampleCount: number;
  readonly seriesCount: number;
};

export type SourcesExportOutcome = {
  readonly isSaved: boolean;
  readonly fileCount: number;
};
