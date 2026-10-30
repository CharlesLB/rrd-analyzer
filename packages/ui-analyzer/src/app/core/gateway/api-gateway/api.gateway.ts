import type { ValueOf } from '../../../shared/types/value-of';
import { blobOfBase64 } from '../../../shared/utils/blob-encoding/blob-encoding.util';
import { pickFiles } from '../../../shared/utils/file-picker/file-picker.util';
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
import { GatewayRequestError } from '../gateway-request-error/gateway-request-error';

const CSV_MIME_TYPE = 'text/csv';
const SOURCES_MIME_TYPE = 'application/octet-stream';
const SOURCE_FILE_ACCEPT = '.rrd,.xml';
const DOWNLOAD_REVOKE_DELAY = 4000;

export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;

export type ApiCall = {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly cancellation?: AbortSignal;
};

export type ApiTransport = {
  readonly send: (call: ApiCall) => Promise<Response>;
  readonly describeFiles: (files: readonly File[]) => Promise<readonly PickedFileDto[]>;
};

const API_PATHS = {
  BUILD: '/api/build',
  SAMPLE_ANALYSIS: '/api/sample-analysis',
  ANALYSES: '/api/analyses',
  SERIES: '/api/series',
  CHART: '/api/chart',
  CSV_EXPORT: '/api/export/csv',
  INSIGHTS_CONFIGURATION: '/api/insights/configuration',
  SEARCH_HISTORY: '/api/search-history',
  SESSIONS: '/api/sessions',
  SHARED_SESSIONS: '/api/shared-sessions',
} as const;

const SHARED_SESSION_REFRESH_RESOURCE = 'refresh';

const FORGET_SEARCH_RESOURCE = 'forget';

const ANALYSIS_RESOURCES = {
  CANVAS: 'canvas',
  LIBRARY_ORDER: 'library-order',
  SERIES_COLOR: 'series-color',
  BUNDLE: 'bundle',
  INSIGHTS: 'insights',
  SOURCES: 'sources',
  MISSING_SOURCES: 'missing-sources',
  SESSION: 'session',
} as const;

type AnalysisResource = ValueOf<typeof ANALYSIS_RESOURCES>;

const analysisPath = (analysisId: string): string => `${API_PATHS.ANALYSES}/${analysisId}`;

const searchHistoryPath = (field: string): string => `${API_PATHS.SEARCH_HISTORY}/${encodeURIComponent(field)}`;

const analysisResourcePath = (analysisId: string, resource: AnalysisResource): string => `${analysisPath(analysisId)}/${resource}`;

const sharedSessionPath = (sessionId: string): string => `${API_PATHS.SHARED_SESSIONS}/${encodeURIComponent(sessionId)}`;

type CsvExportPayloadDto = CsvExportDto & { readonly fileName: string; readonly content: string };

type SourcesExportPayloadDto = { readonly fileName: string; readonly content: string; readonly fileCount: number };

const download = (fileName: string, blob: Blob): void => {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = href;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  }, DOWNLOAD_REVOKE_DELAY);
};

export abstract class ApiGateway implements AnalyzerGateway {
  private readonly _transport: ApiTransport;

  protected constructor(transport: ApiTransport) {
    this._transport = transport;
  }

  public async fetchBuild(): Promise<BuildDto> {
    return await this._request<BuildDto>(HTTP_METHODS.GET, API_PATHS.BUILD);
  }

  public async fetchSampleAnalysis(): Promise<SampleAnalysisDto | null> {
    return await this._request<SampleAnalysisDto>(HTTP_METHODS.GET, API_PATHS.SAMPLE_ANALYSIS);
  }

  public async listAnalyses(): Promise<readonly AnalysisDto[]> {
    return await this._request<readonly AnalysisDto[]>(HTTP_METHODS.GET, API_PATHS.ANALYSES);
  }

  public async createAnalysis(name: string, files: readonly PickedFileDto[]): Promise<AnalysisDto> {
    return await this._request<AnalysisDto>(HTTP_METHODS.POST, API_PATHS.ANALYSES, { name, files });
  }

  public async renameAnalysis(analysisId: string, name: string): Promise<AnalysisDto> {
    return await this._request<AnalysisDto>(HTTP_METHODS.PATCH, analysisPath(analysisId), { name });
  }

  public async addSources(analysisId: string, files: readonly PickedFileDto[]): Promise<AddedSourcesDto> {
    return await this._request<AddedSourcesDto>(HTTP_METHODS.POST, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.SOURCES), { files });
  }

  public async deleteAnalysis(analysisId: string): Promise<void> {
    await this._requestWithoutAnswer(HTTP_METHODS.DELETE, analysisPath(analysisId));
  }

  public async saveCanvas(analysisId: string, canvas: readonly CanvasChartDto[]): Promise<void> {
    await this._requestWithoutAnswer(HTTP_METHODS.PUT, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.CANVAS), { canvas });
  }

  public async saveLibraryOrder(analysisId: string, libraryOrder: readonly ChartReferenceDto[]): Promise<void> {
    await this._requestWithoutAnswer(HTTP_METHODS.PUT, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.LIBRARY_ORDER), { libraryOrder });
  }

  public async saveSeriesColor(analysisId: string, seriesColor: SeriesColorDto): Promise<void> {
    await this._requestWithoutAnswer(HTTP_METHODS.PUT, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.SERIES_COLOR), seriesColor);
  }

  public async openAnalysis(analysisId: string): Promise<BundleDto> {
    return await this._request<BundleDto>(HTTP_METHODS.GET, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.BUNDLE));
  }

  public async missingSources(analysisId: string): Promise<readonly PickedFileDto[]> {
    return await this._request<readonly PickedFileDto[]>(HTTP_METHODS.GET, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.MISSING_SOURCES));
  }

  public async fetchSeries(request: WindowRequestDto): Promise<readonly WindowDto[]> {
    return await this._request<readonly WindowDto[]>(HTTP_METHODS.POST, API_PATHS.SERIES, request);
  }

  public async fetchChart(request: WindowRequestDto): Promise<ChartDto> {
    return await this._request<ChartDto>(HTTP_METHODS.POST, API_PATHS.CHART, request);
  }

  public async pickSources(): Promise<readonly PickedFileDto[]> {
    return await this._transport.describeFiles(await pickFiles(document, { accept: SOURCE_FILE_ACCEPT, allowsMany: true }));
  }

  public async describeSources(): Promise<readonly PickedFileDto[]> {
    return [];
  }

  public async describeFiles(files: readonly File[]): Promise<readonly PickedFileDto[]> {
    return await this._transport.describeFiles(files);
  }

  public async exportCsv(request: ExportRequestDto): Promise<CsvExportDto> {
    const exported = await this._request<CsvExportPayloadDto>(HTTP_METHODS.POST, API_PATHS.CSV_EXPORT, request);

    download(exported.fileName, new Blob([exported.content], { type: CSV_MIME_TYPE }));

    return { sampleCount: exported.sampleCount, seriesCount: exported.seriesCount };
  }

  public async exportImage(fileName: string, image: Blob): Promise<string> {
    download(fileName, image);

    return fileName;
  }

  public async exportSources(analysisId: string): Promise<SourcesExportDto> {
    const exported = await this._request<SourcesExportPayloadDto>(HTTP_METHODS.GET, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.SOURCES));

    download(exported.fileName, blobOfBase64(exported.content, SOURCES_MIME_TYPE));

    return { path: exported.fileName, fileCount: exported.fileCount };
  }

  public async runInsights(request: InsightsRequestDto, cancellation: AbortSignal): Promise<InsightsReportDto> {
    const path = analysisResourcePath(request.analysisId, ANALYSIS_RESOURCES.INSIGHTS);

    return (await (await this._send(HTTP_METHODS.POST, path, request, cancellation)).json()) as InsightsReportDto;
  }

  public async fetchInsightsConfiguration(): Promise<ConfigurationStampDto> {
    return await this._request<ConfigurationStampDto>(HTTP_METHODS.GET, API_PATHS.INSIGHTS_CONFIGURATION);
  }

  public async fetchSearchHistory(field: string): Promise<readonly string[]> {
    return await this._request<readonly string[]>(HTTP_METHODS.GET, searchHistoryPath(field));
  }

  public async rememberSearch(field: string, term: string): Promise<readonly string[]> {
    return await this._request<readonly string[]>(HTTP_METHODS.POST, searchHistoryPath(field), { term });
  }

  public async forgetSearch(field: string, term: string): Promise<readonly string[]> {
    return await this._request<readonly string[]>(HTTP_METHODS.POST, `${searchHistoryPath(field)}/${FORGET_SEARCH_RESOURCE}`, { term });
  }

  public watchFileDrop(): () => void {
    return () => undefined;
  }

  public async listSessions(): Promise<readonly SessionStatusDto[]> {
    return await this._request<readonly SessionStatusDto[]>(HTTP_METHODS.GET, API_PATHS.SESSIONS);
  }

  public async startSession(analysisId: string, publication: SessionPublicationDto): Promise<SessionStatusDto> {
    return await this._request<SessionStatusDto>(HTTP_METHODS.POST, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.SESSION), publication);
  }

  public async publishSession(analysisId: string, publication: SessionPublicationDto): Promise<SessionStatusDto> {
    return await this._request<SessionStatusDto>(HTTP_METHODS.PUT, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.SESSION), publication);
  }

  public async endSession(analysisId: string): Promise<void> {
    await this._requestWithoutAnswer(HTTP_METHODS.DELETE, analysisResourcePath(analysisId, ANALYSIS_RESOURCES.SESSION));
  }

  public async joinSession(sessionId: string, key: string): Promise<JoinedSessionDto> {
    return await this._request<JoinedSessionDto>(HTTP_METHODS.POST, API_PATHS.SHARED_SESSIONS, { sessionId, key });
  }

  public async refreshSession(sessionId: string): Promise<JoinedSessionDto> {
    return await this._request<JoinedSessionDto>(HTTP_METHODS.POST, `${sharedSessionPath(sessionId)}/${SHARED_SESSION_REFRESH_RESOURCE}`);
  }

  public async forgetSession(sessionId: string): Promise<void> {
    await this._requestWithoutAnswer(HTTP_METHODS.DELETE, sharedSessionPath(sessionId));
  }

  private async _request<TResponse>(method: string, path: string, body?: unknown): Promise<TResponse> {
    return (await (await this._send(method, path, body)).json()) as TResponse;
  }

  private async _requestWithoutAnswer(method: string, path: string, body?: unknown): Promise<void> {
    await this._send(method, path, body);
  }

  private async _send(method: string, path: string, body?: unknown, cancellation?: AbortSignal): Promise<Response> {
    const response = await this._transport.send({ method, path, body, cancellation });

    if (!response.ok) {
      throw new GatewayRequestError(`${method} ${path} failed: ${response.status} ${await response.text()}`, response.status);
    }

    return response;
  }
}
