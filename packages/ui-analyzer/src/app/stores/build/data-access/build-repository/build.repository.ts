import { Service } from '@angular/core';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';

@Service()
export class BuildRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async summary(): Promise<string> {
    return (await this._withGateway(async (gateway) => await gateway.fetchBuild())).summary;
  }
}
