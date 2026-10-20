import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { CPU_USER_SERIES } from '../../../workspace/models/series/series.fixture';
import type { TrackReader } from '../../data-access/export-repository/export.types';
import { LIGHT_EXPORT_PALETTE } from '../../models/export-palette/export-palette';
import { ExportRenderer, type ExportRenderRequest } from './export-renderer';

const FONT = new Blob([new Uint8Array([0x77, 0x4f, 0x46, 0x32])], { type: 'font/woff2' });

const renderRequest = (readTracks: TrackReader = async () => ({ s3: [1, 2, 3] })): ExportRenderRequest => {
  const texts = TestBed.inject(I18nStore).texts();

  return {
    analysisId: 'a1',
    readTracks,
    analysisName: 'Atlas prod',
    charts: [{ lines: [{ series: CPU_USER_SERIES, axis: 0 }] }],
    window: { fromMilliseconds: 0, untilMilliseconds: 86_400_000 },
    findings: [],
    palette: LIGHT_EXPORT_PALETTE,
    texts: {
      brand: texts.application.name,
      mergedSeparator: texts.application.mergedSeparator,
      document: texts.export.document,
      severities: texts.insights.severities,
      units: texts.units,
    },
  };
};

describe('ExportRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const configure = () => {
    const fetchFont = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => FONT });
    vi.stubGlobal('fetch', fetchFont);
    const gateway = analyzerGatewayStub();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });

    return { gateway, fetchFont, renderer: TestBed.inject(ExportRenderer) };
  };

  it('documentOf reads the charts at the export resolution over the window and draws each of them', async () => {
    const { renderer } = configure();
    const readTracks = vi.fn<TrackReader>().mockResolvedValue({ s3: [1, 2, 3] });

    const document = await renderer.documentOf(renderRequest(readTracks));

    expect(readTracks).toHaveBeenCalledWith({ analysisId: 'a1', seriesIds: ['s3'], fromMilliseconds: 0, untilMilliseconds: 86_400_000, columns: 960 });
    expect(document.markup).toContain('atlas_system_cpu_user');
  });

  it('documentOf asks for the embedded font again after a failure, rather than exporting without it for ever', async () => {
    const { fetchFont, renderer } = configure();
    fetchFont.mockRejectedValueOnce(new Error('offline'));

    const withoutFont = await renderer.documentOf(renderRequest());
    const withFont = await renderer.documentOf(renderRequest());

    expect(withoutFont.markup).not.toContain('@font-face');
    expect(withFont.markup).toContain("@font-face{font-family:'Nunito'");
    expect(fetchFont).toHaveBeenCalledTimes(2);
  });

  it('documentOf fetches the embedded font once however many documents it renders', async () => {
    const { fetchFont, renderer } = configure();

    await renderer.documentOf(renderRequest());
    await renderer.documentOf(renderRequest());

    expect(fetchFont).toHaveBeenCalledTimes(1);
  });
});
