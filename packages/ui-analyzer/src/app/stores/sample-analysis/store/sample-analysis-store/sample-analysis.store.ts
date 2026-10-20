import { inject, Service } from '@angular/core';
import { APPLICATION_EDITION } from '../../../../core/config/edition.token';
import { SampleAnalysisRepository } from '../../data-access/sample-analysis-repository/sample-analysis.repository';
import type { SampleAnalysis } from '../../models/sample-analysis/sample-analysis.model';

@Service()
export class SampleAnalysisStore {
  private readonly _edition = inject(APPLICATION_EDITION);
  private readonly _repository = inject(SampleAnalysisRepository);
  private readonly _loading: { request?: Promise<SampleAnalysis | null> } = {};
  private readonly _handover = { isLogHandedOver: false };

  public async logToOpenWith(analysisId: string): Promise<File | null> {
    if (!this._edition.runsInTheBrowser) {
      return null;
    }

    this._loading.request ??= this._read();

    const sampleAnalysis = await this._loading.request;

    if (sampleAnalysis === null || sampleAnalysis.analysisId !== analysisId || this._handover.isLogHandedOver) {
      return null;
    }

    this._handover.isLogHandedOver = true;

    return sampleAnalysis.log;
  }

  private async _read(): Promise<SampleAnalysis | null> {
    try {
      return await this._repository.sampleAnalysis();
    } catch {
      this._loading.request = undefined;

      return null;
    }
  }
}
