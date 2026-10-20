import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { APPLICATION_EDITION } from '../../../../core/config/edition.token';
import { SampleAnalysisRepository } from '../../data-access/sample-analysis-repository/sample-analysis.repository';
import type { SampleAnalysis } from '../../models/sample-analysis/sample-analysis.model';
import { SampleAnalysisStore } from './sample-analysis.store';

const SAMPLE_ID = 'sample';
const OTHER_ID = 'mine';

const sampleAnalysisFixture = (): SampleAnalysis => ({ analysisId: SAMPLE_ID, log: new File(['{"level":"info"}\n'], 'sample-api.ndjson') });

const configureWith = (repository: Pick<SampleAnalysisRepository, 'sampleAnalysis'>, runsInTheBrowser = true): SampleAnalysisStore => {
  TestBed.configureTestingModule({
    providers: [
      { provide: SampleAnalysisRepository, useValue: repository },
      { provide: APPLICATION_EDITION, useValue: { runsInTheBrowser, offlineDownloadUrl: '/#download' } },
    ],
  });

  return TestBed.inject(SampleAnalysisStore);
};

describe('SampleAnalysisStore', () => {
  it('hands the log of the sample over when the analysis opened is the sample', async () => {
    const store = configureWith({ sampleAnalysis: vi.fn().mockResolvedValue(sampleAnalysisFixture()) });

    const log = await store.logToOpenWith(SAMPLE_ID);

    expect(log?.name).toBe('sample-api.ndjson');
  });

  it('hands the log over once per tab, so the sample opened again keeps the logs the person left it with', async () => {
    const store = configureWith({ sampleAnalysis: vi.fn().mockResolvedValue(sampleAnalysisFixture()) });

    await store.logToOpenWith(SAMPLE_ID);
    const second = await store.logToOpenWith(SAMPLE_ID);

    expect(second).toBeNull();
  });

  it('hands nothing over for an analysis of the visitor, and still hands the log over when the sample opens next', async () => {
    const repository = { sampleAnalysis: vi.fn().mockResolvedValue(sampleAnalysisFixture()) };
    const store = configureWith(repository);

    const forTheirs = await store.logToOpenWith(OTHER_ID);
    const forTheSample = await store.logToOpenWith(SAMPLE_ID);

    expect(forTheirs).toBeNull();
    expect(forTheSample).not.toBeNull();
    expect(repository.sampleAnalysis).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing outside the browser edition, which opens on no sample', async () => {
    const repository = { sampleAnalysis: vi.fn().mockResolvedValue(sampleAnalysisFixture()) };
    const store = configureWith(repository, false);

    const log = await store.logToOpenWith(SAMPLE_ID);

    expect(log).toBeNull();
    expect(repository.sampleAnalysis).not.toHaveBeenCalled();
  });

  it('hands nothing over when the sample cannot be read, and asks again the next time', async () => {
    const repository = { sampleAnalysis: vi.fn().mockRejectedValueOnce(new Error('worker down')).mockResolvedValue(sampleAnalysisFixture()) };
    const store = configureWith(repository);

    const failed = await store.logToOpenWith(SAMPLE_ID);
    const retried = await store.logToOpenWith(SAMPLE_ID);

    expect(failed).toBeNull();
    expect(retried).not.toBeNull();
  });
});
