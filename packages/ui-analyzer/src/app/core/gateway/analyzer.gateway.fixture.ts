import type { Provider } from '@angular/core';
import { MILLISECONDS_PER_DAY, MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import { vi } from 'vitest';
import { SERIES_COLORS } from '../../shared/constants/colors';
import type {
  AnalysisDto,
  BuildDto,
  BundleDto,
  ConfigurationStampDto,
  InsightsReportDto,
  JoinedSessionDto,
  PlottedChartDto,
  SeriesDto,
  SeriesStatisticsDto,
  SessionStatusDto,
} from './analyzer.dto';
import type { AnalyzerGateway } from './analyzer.gateway';
import { BrowserGateway } from './browser-gateway/browser.gateway';

const FIXTURE_ANALYSIS_ID = 'a1';
export const FIXTURE_UNTIL_MILLISECONDS = 1_788_026_400_000;
const FIXTURE_STEP_MILLISECONDS = 300_000;

export const analysisDtoFixture = (overrides: Partial<AnalysisDto> = {}): AnalysisDto => ({
  id: FIXTURE_ANALYSIS_ID,
  name: 'Atlas prod · capacity',
  canvas: [
    { seriesId: 's3', label: 'system_cpu_user', merged: [] },
    { seriesId: 's5', label: 'system_memory_used', merged: [] },
  ],
  lastAccessedMilliseconds: FIXTURE_UNTIL_MILLISECONDS,
  ...overrides,
});

export const seriesDtoFixture = (index: number, overrides: Partial<SeriesDto> = {}): SeriesDto => ({
  id: `s${index}`,
  file: `atlas_metric_${index}.rrd`,
  name: `atlas_metric_${index}`,
  label: `metric_${index}`,
  unit: index === 1 ? 'ms' : '',
  color: SERIES_COLORS[0],
  dataSource: 'value',
  dataSourceType: 'GAUGE',
  startMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 30 * MILLISECONDS_PER_DAY,
  stepMilliseconds: FIXTURE_STEP_MILLISECONDS,
  ...overrides,
});

export const chartsDtoFixture = (...seriesIds: readonly string[]): readonly PlottedChartDto[] =>
  seriesIds.map((seriesId) => ({ series: [{ seriesId, axis: 0 }] }));

export const bundleDtoFixture = (seriesCount = 5, overrides: Partial<BundleDto> = {}): BundleDto => ({
  analysisId: FIXTURE_ANALYSIS_ID,
  analysisName: 'Atlas prod · capacity',
  fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 30 * MILLISECONDS_PER_DAY,
  untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS,
  series: Array.from({ length: seriesCount }, (_unused, index) => seriesDtoFixture(index)),
  canvas: [],
  ...overrides,
});

export const statisticsDtoFixture = (seriesId: string, overrides: Partial<SeriesStatisticsDto['statistics']> = {}): SeriesStatisticsDto => ({
  seriesId,
  hasData: true,
  statistics: { minimum: 1, maximum: 3, average: 2, percentile95: 3, last: 3, gapCount: 1, ...overrides },
});

const hoursBeforeUntil = (hours: number): number => FIXTURE_UNTIL_MILLISECONDS - hours * MILLISECONDS_PER_HOUR;

export const configurationStampDtoFixture = (rulesetHash = 'rules-1'): ConfigurationStampDto => ({ rulesetHash, classifierHash: 'classifier-1' });

export const insightsReportDtoFixture = (overrides: Partial<InsightsReportDto> = {}): InsightsReportDto => ({
  analyzed: {
    scope: 'all',
    ...configurationStampDtoFixture(),
    fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 30 * MILLISECONDS_PER_DAY,
    untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS,
    seriesUnclassified: [{ seriesId: 's0', label: 'runtime_goroutines' }],
  },
  findings: [
    {
      id: 'fd0',
      severity: 'critical',
      inferred: true,
      match: 'evidence order matches rule',
      title: 'Process likely went down out of memory',
      fromMilliseconds: hoursBeforeUntil(12),
      untilMilliseconds: hoursBeforeUntil(5),
      cause: [
        { text: 'Heap objects and resident memory climbed for ', emphasis: false },
        { text: '3.1 h', emphasis: true },
      ],
      evidence: [
        {
          semantic: 'heap.objects',
          seriesId: 's2',
          source: 'atlas_runtime_heap_objects.rrd',
          direction: 'rising',
          fromMilliseconds: hoursBeforeUntil(12),
          untilMilliseconds: hoursBeforeUntil(9),
          fromValue: 1_080_000,
          toValue: 1_370_000,
          unit: '',
          spark: [1, null, 3],
        },
        {
          semantic: 'memory.used',
          seriesId: 's1',
          source: 'atlas_system_memory_used.rrd',
          direction: 'gap',
          fromMilliseconds: hoursBeforeUntil(6),
          untilMilliseconds: hoursBeforeUntil(5.5),
          fromValue: null,
          toValue: null,
          unit: 'B',
          spark: [],
        },
      ],
    },
    {
      id: 'fd1',
      severity: 'warning',
      inferred: false,
      match: 'partial match — single signal',
      title: 'Sustained CPU saturation',
      fromMilliseconds: hoursBeforeUntil(20),
      untilMilliseconds: hoursBeforeUntil(19),
      cause: [],
      evidence: [],
    },
  ],
  ...overrides,
});

export const FIXTURE_SESSION_ID = 'Qm9vdHN0cmFwU2Vzc2lvbg';
export const FIXTURE_SESSION_KEY = 'a2V5LW9mLXRoZS1zZXNzaW9uLWZvci10aGUtZml4dHVyZXM';
export const FIXTURE_EXPIRES_AT_MILLISECONDS = FIXTURE_UNTIL_MILLISECONDS + MILLISECONDS_PER_HOUR;

export const sessionStatusDtoFixture = (overrides: Partial<SessionStatusDto> = {}): SessionStatusDto => ({
  analysisId: FIXTURE_ANALYSIS_ID,
  sessionId: FIXTURE_SESSION_ID,
  link: `https://rrd-analyzer.example/app/#/shared/${FIXTURE_SESSION_ID}/${FIXTURE_SESSION_KEY}`,
  revision: 1,
  expiresAtMilliseconds: FIXTURE_EXPIRES_AT_MILLISECONDS,
  files: [
    { name: 'atlas_metric_0.rrd', path: '/rrd/atlas_metric_0.rrd', online: true },
    { name: 'atlas_metric_1.rrd', path: '/rrd/atlas_metric_1.rrd', online: false },
  ],
  log: null,
  ...overrides,
});

export const joinedSessionDtoFixture = (overrides: Partial<JoinedSessionDto> = {}): JoinedSessionDto => ({
  sessionId: FIXTURE_SESSION_ID,
  analysisId: FIXTURE_ANALYSIS_ID,
  revision: 1,
  expiresAtMilliseconds: FIXTURE_EXPIRES_AT_MILLISECONDS,
  liveUrl: `wss://rrd-analyzer.example/api/sessions/${FIXTURE_SESSION_ID}/live`,
  changed: true,
  log: null,
  ...overrides,
});

export const buildDtoFixture = (overrides: Partial<BuildDto> = {}): BuildDto => ({
  version: '1.4.0',
  commit: 'abcdef0123456',
  date: '2026-09-28',
  summary: '1.4.0 (abcdef0)',
  sharesSessions: false,
  ...overrides,
});

export const analyzerGatewayStub = (overrides: Partial<AnalyzerGateway> = {}): AnalyzerGateway =>
  ({
    fetchBuild: vi.fn().mockResolvedValue(buildDtoFixture()),
    fetchSampleAnalysis: vi.fn().mockResolvedValue(null),
    listAnalyses: vi.fn().mockResolvedValue([analysisDtoFixture()]),
    createAnalysis: vi.fn().mockResolvedValue(analysisDtoFixture()),
    addSources: vi.fn().mockResolvedValue({ analysis: analysisDtoFixture(), added: 1 }),
    renameAnalysis: vi.fn().mockImplementation((_analysisId: string, name: string) => Promise.resolve(analysisDtoFixture({ name: name.trim() }))),
    deleteAnalysis: vi.fn().mockResolvedValue(undefined),
    saveCanvas: vi.fn().mockResolvedValue(undefined),
    saveLibraryOrder: vi.fn().mockResolvedValue(undefined),
    saveSeriesColor: vi.fn().mockResolvedValue(undefined),
    openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture()),
    missingSources: vi.fn().mockResolvedValue([]),
    fetchSeries: vi
      .fn()
      .mockImplementation((request: { readonly seriesIds: readonly string[] }) =>
        Promise.resolve(request.seriesIds.map((seriesId) => ({ seriesId, samples: [1, 2, 3] }))),
      ),
    fetchChart: vi.fn().mockImplementation((request: { readonly seriesIds: readonly string[] }) =>
      Promise.resolve({
        windows: request.seriesIds.map((seriesId) => ({ seriesId, samples: [1, 2, 3] })),
        statistics: request.seriesIds.map((seriesId) => statisticsDtoFixture(seriesId)),
      }),
    ),
    pickSources: vi.fn().mockResolvedValue([{ name: 'picked.rrd', path: '', size: 512 }]),
    describeSources: vi.fn().mockResolvedValue([{ name: 'dropped.rrd', path: '/dropped.rrd', size: 1024 }]),
    describeFiles: vi
      .fn()
      .mockImplementation((files: readonly File[]) =>
        Promise.resolve(files.map((file) => ({ name: file.name, path: `memory:/1/${file.name}`, size: file.size }))),
      ),
    exportCsv: vi.fn().mockResolvedValue({ sampleCount: 288, seriesCount: 1 }),
    exportImage: vi.fn().mockResolvedValue('/exports/rrd_202608281500_202608291500.png'),
    exportSources: vi.fn().mockResolvedValue({ path: '/exports/atlas-prod-capacity.zip', fileCount: 2 }),
    runInsights: vi.fn().mockResolvedValue(insightsReportDtoFixture()),
    fetchInsightsConfiguration: vi.fn().mockResolvedValue(configurationStampDtoFixture()),
    fetchSearchHistory: vi.fn().mockResolvedValue([]),
    rememberSearch: vi.fn().mockImplementation((_field: string, term: string) => Promise.resolve([term.trim()])),
    forgetSearch: vi.fn().mockResolvedValue([]),
    watchFileDrop: vi.fn().mockReturnValue(() => undefined),
    listSessions: vi.fn().mockResolvedValue([]),
    startSession: vi.fn().mockResolvedValue(sessionStatusDtoFixture()),
    publishSession: vi.fn().mockResolvedValue(sessionStatusDtoFixture({ revision: 2 })),
    endSession: vi.fn().mockResolvedValue(undefined),
    joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture()),
    refreshSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ revision: 2 })),
    forgetSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as AnalyzerGateway;

export const provideGatewayStub = (gateway: AnalyzerGateway): Provider => ({ provide: BrowserGateway, useValue: gateway });
