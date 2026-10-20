import { Service } from '@angular/core';
import type { SampleAnalysisDto } from '../../../../core/gateway/analyzer.dto';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import type { SampleAnalysis } from '../../models/sample-analysis/sample-analysis.model';

const LOG_MIME_TYPE = 'application/x-ndjson';

const toSampleAnalysis = (dto: SampleAnalysisDto): SampleAnalysis => ({
  analysisId: dto.analysisId,
  log: new File([dto.log.content], dto.log.fileName, { type: LOG_MIME_TYPE }),
});

@Service()
export class SampleAnalysisRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async sampleAnalysis(): Promise<SampleAnalysis | null> {
    const sampleAnalysis = await this._withGateway(async (gateway) => await gateway.fetchSampleAnalysis());

    return sampleAnalysis === null ? null : toSampleAnalysis(sampleAnalysis);
  }
}
