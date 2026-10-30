import type {
  AddedSourcesDto,
  AnalysisDto,
  BuildDto,
  BundleDto,
  CanvasChartDto,
  ChartDto,
  ChartReferenceDto,
  ConfigurationStampDto,
  CsvExportDto,
  ExportRequestDto,
  InsightsReportDto,
  InsightsRequestDto,
  JoinedSessionDto,
  PickedFileDto,
  SampleAnalysisDto,
  SeriesColorDto,
  SessionPublicationDto,
  SessionStatusDto,
  SourcesExportDto,
  WindowDto,
  WindowRequestDto,
} from './analyzer.dto';

export type AnalyzerGateway = {
  fetchBuild(): Promise<BuildDto>;
  fetchSampleAnalysis(): Promise<SampleAnalysisDto | null>;
  listAnalyses(): Promise<readonly AnalysisDto[]>;
  createAnalysis(name: string, files: readonly PickedFileDto[]): Promise<AnalysisDto>;
  renameAnalysis(analysisId: string, name: string): Promise<AnalysisDto>;
  addSources(analysisId: string, files: readonly PickedFileDto[]): Promise<AddedSourcesDto>;
  deleteAnalysis(analysisId: string): Promise<void>;
  saveCanvas(analysisId: string, canvas: readonly CanvasChartDto[]): Promise<void>;
  saveLibraryOrder(analysisId: string, libraryOrder: readonly ChartReferenceDto[]): Promise<void>;
  saveSeriesColor(analysisId: string, seriesColor: SeriesColorDto): Promise<void>;
  openAnalysis(analysisId: string): Promise<BundleDto>;
  missingSources(analysisId: string): Promise<readonly PickedFileDto[]>;
  fetchSeries(request: WindowRequestDto): Promise<readonly WindowDto[]>;
  fetchChart(request: WindowRequestDto): Promise<ChartDto>;
  pickSources(): Promise<readonly PickedFileDto[]>;
  describeSources(paths: readonly string[]): Promise<readonly PickedFileDto[]>;
  describeFiles(files: readonly File[]): Promise<readonly PickedFileDto[]>;
  exportCsv(request: ExportRequestDto): Promise<CsvExportDto>;
  exportImage(fileName: string, image: Blob): Promise<string>;
  exportSources(analysisId: string): Promise<SourcesExportDto>;
  runInsights(request: InsightsRequestDto, cancellation: AbortSignal): Promise<InsightsReportDto>;
  fetchInsightsConfiguration(): Promise<ConfigurationStampDto>;
  fetchSearchHistory(field: string): Promise<readonly string[]>;
  rememberSearch(field: string, term: string): Promise<readonly string[]>;
  forgetSearch(field: string, term: string): Promise<readonly string[]>;
  watchFileDrop(handler: (paths: readonly string[]) => void): () => void;
  listSessions(): Promise<readonly SessionStatusDto[]>;
  startSession(analysisId: string, publication: SessionPublicationDto): Promise<SessionStatusDto>;
  publishSession(analysisId: string, publication: SessionPublicationDto): Promise<SessionStatusDto>;
  endSession(analysisId: string): Promise<void>;
  joinSession(sessionId: string, key: string): Promise<JoinedSessionDto>;
  refreshSession(sessionId: string): Promise<JoinedSessionDto>;
  forgetSession(sessionId: string): Promise<void>;
};
