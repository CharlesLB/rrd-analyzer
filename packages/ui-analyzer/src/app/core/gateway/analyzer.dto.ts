export type SampleDto = number | null;

export type ChartReferenceDto = {
  readonly seriesId: string;
  readonly label: string;
};

export type MergedSeriesDto = {
  readonly seriesId: string;
  readonly label: string;
  readonly axis: number;
};

export type CanvasChartDto = {
  readonly seriesId: string;
  readonly label: string;
  readonly merged: readonly MergedSeriesDto[];
  readonly referenceLines?: readonly string[];
};

export type SeriesColorDto = {
  readonly seriesId: string;
  readonly label: string;
  readonly color: string;
};

export type AnalysisDto = {
  readonly id: string;
  readonly name: string;
  readonly canvas: readonly CanvasChartDto[];
  readonly lastAccessedMilliseconds: number;
};

export type SeriesDto = {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly label: string;
  readonly unit: string;
  readonly color: string;
  readonly dataSource: string;
  readonly dataSourceType: string;
  readonly startMilliseconds: number;
  readonly stepMilliseconds: number;
};

export type PlottedSeriesDto = {
  readonly seriesId: string;
  readonly axis: number;
};

export type PlottedChartDto = {
  readonly series: readonly PlottedSeriesDto[];
  readonly referenceLines?: readonly string[];
};

export type BundleDto = {
  readonly analysisId: string;
  readonly analysisName: string;
  readonly series: readonly SeriesDto[];
  readonly canvas: readonly PlottedChartDto[];
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
};

export type WindowDto = {
  readonly seriesId: string;
  readonly samples: readonly SampleDto[];
};

export type StatisticsValuesDto = {
  readonly minimum: number;
  readonly maximum: number;
  readonly average: number;
  readonly percentile95: number;
  readonly last: number;
  readonly gapCount: number;
};

export type SeriesStatisticsDto = {
  readonly seriesId: string;
  readonly hasData: boolean;
  readonly statistics: StatisticsValuesDto;
};

export type ChartDto = {
  readonly windows: readonly WindowDto[];
  readonly statistics: readonly SeriesStatisticsDto[];
};

export type PickedFileDto = {
  readonly name: string;
  readonly path: string;
  readonly size: number;
};

export type WindowRequestDto = {
  readonly analysisId: string;
  readonly seriesIds: readonly string[];
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly columns: number;
};

export type ExportRequestDto = {
  readonly analysisId: string;
  readonly seriesIds: readonly string[];
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
};

export type SourcesExportDto = {
  readonly path: string;
  readonly fileCount: number;
};

export type AddedSourcesDto = {
  readonly analysis: AnalysisDto;
  readonly added: number;
};

export type CsvExportDto = {
  readonly path?: string;
  readonly sampleCount: number;
  readonly seriesCount: number;
};

export type InsightsRequestDto = {
  readonly analysisId: string;
  readonly scope: string;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly seriesIds: readonly string[];
};

export type CausePartDto = {
  readonly text: string;
  readonly emphasis: boolean;
};

export type EvidenceDto = {
  readonly semantic: string;
  readonly seriesId: string;
  readonly source: string;
  readonly direction: string;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly fromValue: number | null;
  readonly toValue: number | null;
  readonly unit: string;
  readonly spark: readonly (number | null)[];
};

export type FindingDto = {
  readonly id: string;
  readonly severity: string;
  readonly inferred: boolean;
  readonly match: string;
  readonly title: string;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly cause: readonly CausePartDto[];
  readonly evidence: readonly EvidenceDto[];
};

export type ConfigurationStampDto = {
  readonly rulesetHash: string;
  readonly classifierHash: string;
};

export type AnalyzedSpanDto = ConfigurationStampDto & {
  readonly scope: string;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly seriesUnclassified: readonly ChartReferenceDto[];
};

export type InsightsReportDto = {
  readonly analyzed: AnalyzedSpanDto;
  readonly findings: readonly FindingDto[];
};

export type BuildDto = {
  readonly version: string;
  readonly commit: string;
  readonly date: string;
  readonly summary: string;
};

export type SampleAnalysisLogDto = {
  readonly fileName: string;
  readonly content: string;
};

export type SampleAnalysisDto = {
  readonly analysisId: string;
  readonly log: SampleAnalysisLogDto;
};
