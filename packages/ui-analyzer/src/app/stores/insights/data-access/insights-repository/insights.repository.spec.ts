import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { InsightsRepository } from './insights.repository';

describe('InsightsRepository', () => {
  let gateway: AnalyzerGateway;
  let repository: InsightsRepository;

  beforeEach(() => {
    gateway = analyzerGatewayStub();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    repository = TestBed.inject(InsightsRepository);
  });

  it('asks the engine for the scope over whole milliseconds of the window and every series', async () => {
    const cancellation = new AbortController().signal;

    await repository.run({ analysisId: 'a1', scope: 'viewport', window: { fromMilliseconds: 10.4, untilMilliseconds: 20.6 } }, cancellation);

    expect(gateway.runInsights).toHaveBeenCalledWith(
      { analysisId: 'a1', scope: 'viewport', fromMilliseconds: 10, untilMilliseconds: 21, seriesIds: [] },
      cancellation,
    );
  });

  it('maps the report onto findings with their cause, evidence and the series it could not classify', async () => {
    const report = await repository.run(
      { analysisId: 'a1', scope: 'all', window: { fromMilliseconds: 0, untilMilliseconds: 1 } },
      new AbortController().signal,
    );

    const [finding] = report.findings;

    expect(report.scope).toBe('all');
    expect(report.unclassifiedLabels).toEqual(['runtime_goroutines']);
    expect(finding.severity).toBe('critical');
    expect(finding.isInferred).toBe(true);
    expect(finding.cause[1]).toEqual({ text: '3.1 h', isEmphasized: true });
    expect(finding.evidence[0]).toMatchObject({ semantic: 'heap.objects', direction: 'rising', fromValue: 1_080_000, spark: [1, null, 3] });
    expect(finding.evidence[1]).toMatchObject({ direction: 'gap', fromValue: null, spark: [] });
  });

  it('names the rules a report was made under the same way it names the rules in force now', async () => {
    const report = await repository.run(
      { analysisId: 'a1', scope: 'all', window: { fromMilliseconds: 0, untilMilliseconds: 1 } },
      new AbortController().signal,
    );

    expect(await repository.configurationStamp()).toBe(report.configurationStamp);
  });
});
