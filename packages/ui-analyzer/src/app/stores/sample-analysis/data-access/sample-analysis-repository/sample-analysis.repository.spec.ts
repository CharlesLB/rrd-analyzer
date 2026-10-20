import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { SampleAnalysisRepository } from './sample-analysis.repository';

const LOG_CONTENT = '{"timestamp":"2026-09-30T12:00:00.000Z","level":"info","message":"health check passed"}\n';

const configureWith = (gateway: AnalyzerGateway): SampleAnalysisRepository => {
  TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });

  return TestBed.inject(SampleAnalysisRepository);
};

describe('SampleAnalysisRepository', () => {
  it('turns what the edition answers into the sample analysis and a log file the page reads like a dropped one', async () => {
    const repository = configureWith(
      analyzerGatewayStub({
        fetchSampleAnalysis: vi.fn().mockResolvedValue({ analysisId: 'sample', log: { fileName: 'sample-api.ndjson', content: LOG_CONTENT } }),
      }),
    );

    const sampleAnalysis = await repository.sampleAnalysis();

    expect(sampleAnalysis?.analysisId).toBe('sample');
    expect(sampleAnalysis?.log.name).toBe('sample-api.ndjson');
    expect(await sampleAnalysis?.log.text()).toBe(LOG_CONTENT);
  });

  it('answers no sample when the edition opens on none', async () => {
    const repository = configureWith(analyzerGatewayStub());

    const sampleAnalysis = await repository.sampleAnalysis();

    expect(sampleAnalysis).toBeNull();
  });
});
