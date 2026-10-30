import { Service } from '@angular/core';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import type { BuildInfo } from '../../models/build-info/build-info';

@Service()
export class BuildRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async build(): Promise<BuildInfo> {
    const { summary, sharesSessions } = await this._withGateway(async (gateway) => await gateway.fetchBuild());

    return { summary, sharesSessions };
  }
}
