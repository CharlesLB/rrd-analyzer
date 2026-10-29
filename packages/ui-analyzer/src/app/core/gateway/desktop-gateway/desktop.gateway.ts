import { Service } from '@angular/core';
import { base64Of } from '../../../shared/utils/blob-encoding/blob-encoding.util';
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
} from '../analyzer.dto';
import type { AnalyzerGateway } from '../analyzer.gateway';
import { desktopBinding, desktopBindingName, desktopRuntimeApi } from '../desktop-runtime/desktop-runtime';

const DESKTOP_METHODS = {
  BUILD: 'Build',
  LIST_ANALYSES: 'ListAnalyses',
  CREATE_ANALYSIS: 'CreateAnalysis',
  RENAME_ANALYSIS: 'RenameAnalysis',
  ADD_SOURCES: 'AddSources',
  DELETE_ANALYSIS: 'DeleteAnalysis',
  SAVE_CANVAS: 'SaveCanvas',
  SAVE_LIBRARY_ORDER: 'SaveLibraryOrder',
  SAVE_SERIES_COLOR: 'SaveSeriesColor',
  OPEN_ANALYSIS: 'OpenAnalysis',
  MISSING_SOURCES: 'MissingSources',
  FETCH_SERIES: 'FetchSeries',
  FETCH_CHART: 'FetchChart',
  SELECT_FILES: 'SelectRRDFiles',
  DESCRIBE_SOURCES: 'DescribeSources',
  EXPORT_CSV: 'ExportCSV',
  EXPORT_IMAGE: 'ExportImage',
  EXPORT_SOURCES: 'ExportSources',
  RUN_INSIGHTS: 'RunInsights',
  CANCEL_INSIGHTS: 'CancelInsights',
  INSIGHTS_CONFIGURATION: 'InsightsConfiguration',
  SEARCH_HISTORY: 'SearchHistory',
  REMEMBER_SEARCH: 'RememberSearch',
  FORGET_SEARCH: 'ForgetSearch',
  LIST_SESSIONS: 'ListSessions',
  START_SESSION: 'StartSession',
  PUBLISH_SESSION: 'PublishSession',
  END_SESSION: 'EndSession',
} as const;

const JOINING_IS_FOR_THE_BROWSER = 'a live session is opened from its link in the browser edition, never in the desktop window';

const ABORT_EVENT = 'abort';
const NO_PATH_FROM_A_PAGE_DROP = '';

@Service()
export class DesktopGateway implements AnalyzerGateway {
  public async fetchBuild(): Promise<BuildDto> {
    return await this._call<BuildDto>(DESKTOP_METHODS.BUILD);
  }

  public async fetchSampleAnalysis(): Promise<SampleAnalysisDto | null> {
    return null;
  }

  public async listAnalyses(): Promise<readonly AnalysisDto[]> {
    return await this._call<readonly AnalysisDto[]>(DESKTOP_METHODS.LIST_ANALYSES);
  }

  public async createAnalysis(name: string, files: readonly PickedFileDto[]): Promise<AnalysisDto> {
    return await this._call<AnalysisDto>(DESKTOP_METHODS.CREATE_ANALYSIS, name, files);
  }

  public async renameAnalysis(analysisId: string, name: string): Promise<AnalysisDto> {
    return await this._call<AnalysisDto>(DESKTOP_METHODS.RENAME_ANALYSIS, analysisId, name);
  }

  public async addSources(analysisId: string, files: readonly PickedFileDto[]): Promise<AddedSourcesDto> {
    return await this._call<AddedSourcesDto>(DESKTOP_METHODS.ADD_SOURCES, analysisId, files);
  }

  public async deleteAnalysis(analysisId: string): Promise<void> {
    await this._call<null>(DESKTOP_METHODS.DELETE_ANALYSIS, analysisId);
  }

  public async saveCanvas(analysisId: string, canvas: readonly CanvasChartDto[]): Promise<void> {
    await this._call<null>(DESKTOP_METHODS.SAVE_CANVAS, analysisId, canvas);
  }

  public async saveLibraryOrder(analysisId: string, libraryOrder: readonly ChartReferenceDto[]): Promise<void> {
    await this._call<null>(DESKTOP_METHODS.SAVE_LIBRARY_ORDER, analysisId, libraryOrder);
  }

  public async saveSeriesColor(analysisId: string, seriesColor: SeriesColorDto): Promise<void> {
    await this._call<null>(DESKTOP_METHODS.SAVE_SERIES_COLOR, analysisId, seriesColor);
  }

  public async openAnalysis(analysisId: string): Promise<BundleDto> {
    return await this._call<BundleDto>(DESKTOP_METHODS.OPEN_ANALYSIS, analysisId);
  }

  public async missingSources(analysisId: string): Promise<readonly PickedFileDto[]> {
    return await this._call<readonly PickedFileDto[]>(DESKTOP_METHODS.MISSING_SOURCES, analysisId);
  }

  public async fetchSeries(request: WindowRequestDto): Promise<readonly WindowDto[]> {
    return await this._call<readonly WindowDto[]>(DESKTOP_METHODS.FETCH_SERIES, request);
  }

  public async fetchChart(request: WindowRequestDto): Promise<ChartDto> {
    return await this._call<ChartDto>(DESKTOP_METHODS.FETCH_CHART, request);
  }

  public async pickSources(): Promise<readonly PickedFileDto[]> {
    return await this._call<readonly PickedFileDto[]>(DESKTOP_METHODS.SELECT_FILES);
  }

  public async describeSources(paths: readonly string[]): Promise<readonly PickedFileDto[]> {
    return await this._call<readonly PickedFileDto[]>(DESKTOP_METHODS.DESCRIBE_SOURCES, paths);
  }

  public async describeFiles(files: readonly File[]): Promise<readonly PickedFileDto[]> {
    return files.map((file) => ({ name: file.name, path: NO_PATH_FROM_A_PAGE_DROP, size: file.size }));
  }

  public async exportCsv(request: ExportRequestDto): Promise<CsvExportDto> {
    return await this._call<CsvExportDto>(DESKTOP_METHODS.EXPORT_CSV, request);
  }

  public async exportImage(fileName: string, image: Blob): Promise<string> {
    return await this._call<string>(DESKTOP_METHODS.EXPORT_IMAGE, fileName, await base64Of(image));
  }

  public async exportSources(analysisId: string): Promise<SourcesExportDto> {
    return await this._call<SourcesExportDto>(DESKTOP_METHODS.EXPORT_SOURCES, analysisId);
  }

  public async runInsights(request: InsightsRequestDto, cancellation: AbortSignal): Promise<InsightsReportDto> {
    const runId = crypto.randomUUID();
    const cancelRun = (): void => void this._call<null>(DESKTOP_METHODS.CANCEL_INSIGHTS, runId);

    cancellation.addEventListener(ABORT_EVENT, cancelRun, { once: true });

    try {
      return await this._call<InsightsReportDto>(DESKTOP_METHODS.RUN_INSIGHTS, runId, request);
    } finally {
      cancellation.removeEventListener(ABORT_EVENT, cancelRun);
    }
  }

  public async fetchInsightsConfiguration(): Promise<ConfigurationStampDto> {
    return await this._call<ConfigurationStampDto>(DESKTOP_METHODS.INSIGHTS_CONFIGURATION);
  }

  public async fetchSearchHistory(field: string): Promise<readonly string[]> {
    return await this._call<readonly string[]>(DESKTOP_METHODS.SEARCH_HISTORY, field);
  }

  public async rememberSearch(field: string, term: string): Promise<readonly string[]> {
    return await this._call<readonly string[]>(DESKTOP_METHODS.REMEMBER_SEARCH, field, term);
  }

  public async forgetSearch(field: string, term: string): Promise<readonly string[]> {
    return await this._call<readonly string[]>(DESKTOP_METHODS.FORGET_SEARCH, field, term);
  }

  public watchFileDrop(handler: (paths: readonly string[]) => void): () => void {
    const runtime = desktopRuntimeApi();

    if (runtime === undefined) {
      return () => undefined;
    }

    runtime.OnFileDrop((_horizontalPosition, _verticalPosition, paths) => handler(paths), true);

    return () => runtime.OnFileDropOff();
  }

  public async listSessions(): Promise<readonly SessionStatusDto[]> {
    return await this._call<readonly SessionStatusDto[]>(DESKTOP_METHODS.LIST_SESSIONS);
  }

  public async startSession(analysisId: string, publication: SessionPublicationDto): Promise<SessionStatusDto> {
    return await this._call<SessionStatusDto>(DESKTOP_METHODS.START_SESSION, analysisId, publication);
  }

  public async publishSession(analysisId: string, publication: SessionPublicationDto): Promise<SessionStatusDto> {
    return await this._call<SessionStatusDto>(DESKTOP_METHODS.PUBLISH_SESSION, analysisId, publication);
  }

  public async endSession(analysisId: string): Promise<void> {
    await this._call<null>(DESKTOP_METHODS.END_SESSION, analysisId);
  }

  public async joinSession(): Promise<JoinedSessionDto> {
    throw new Error(JOINING_IS_FOR_THE_BROWSER);
  }

  public async refreshSession(): Promise<JoinedSessionDto> {
    throw new Error(JOINING_IS_FOR_THE_BROWSER);
  }

  public async forgetSession(): Promise<void> {
    throw new Error(JOINING_IS_FOR_THE_BROWSER);
  }

  private async _call<TResponse>(method: string, ...parameters: readonly unknown[]): Promise<TResponse> {
    const bound = desktopBinding(method);

    if (bound === undefined) {
      throw new Error(`desktop binding ${desktopBindingName(method)} is not available`);
    }

    return (await bound(...parameters)) as TResponse;
  }
}
