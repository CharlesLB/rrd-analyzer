import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { ExportRepository } from './export.repository';

describe('ExportRepository', () => {
  let gateway: AnalyzerGateway;
  let repository: ExportRepository;

  beforeEach(() => {
    gateway = analyzerGatewayStub();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    repository = TestBed.inject(ExportRepository);
  });

  it('exportCsv exports the window through the transport and reports how much it wrote', async () => {
    const exported = await repository.exportCsv({ analysisId: 'a1', seriesIds: ['s1'], fromMilliseconds: 1, untilMilliseconds: 2 });

    expect(gateway.exportCsv).toHaveBeenCalledWith({ analysisId: 'a1', seriesIds: ['s1'], fromMilliseconds: 1, untilMilliseconds: 2 });
    expect(exported).toEqual({ sampleCount: 288, seriesCount: 1, isCancelled: false });
  });

  it('exportCsv tells a save dialog that was cancelled from a file saved with no samples in it', async () => {
    const query = { analysisId: 'a1', seriesIds: ['s1'], fromMilliseconds: 1000, untilMilliseconds: 2000 };
    vi.mocked(gateway.exportCsv).mockResolvedValueOnce({ path: '', sampleCount: 0, seriesCount: 0 });
    vi.mocked(gateway.exportCsv).mockResolvedValueOnce({ path: '/exports/empty.csv', sampleCount: 0, seriesCount: 1 });

    expect((await repository.exportCsv(query)).isCancelled).toBe(true);
    expect((await repository.exportCsv(query)).isCancelled).toBe(false);
  });

  it('exportImage hands a finished image to the transport under the name it suggests and reports that it was saved', async () => {
    const image = new Blob(['png'], { type: 'image/png' });

    const isSaved = await repository.exportImage('rrd_202608281500_202608291500.png', image);

    expect(gateway.exportImage).toHaveBeenCalledWith('rrd_202608281500_202608291500.png', image);
    expect(isSaved).toBe(true);
  });

  it('exportImage whose save dialog is cancelled reports that nothing was saved', async () => {
    vi.mocked(gateway.exportImage).mockResolvedValue('');

    expect(await repository.exportImage('rrd.png', new Blob(['png'], { type: 'image/png' }))).toBe(false);
  });
});
