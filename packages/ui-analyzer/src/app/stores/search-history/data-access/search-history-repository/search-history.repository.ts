import { Service } from '@angular/core';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import type { SearchField } from '../../models/search-field/search-field';

@Service()
export class SearchHistoryRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async historyOf(field: SearchField): Promise<readonly string[]> {
    return await this._withGateway(async (gateway) => await gateway.fetchSearchHistory(field));
  }

  public async remember(field: SearchField, term: string): Promise<readonly string[]> {
    return await this._withGateway(async (gateway) => await gateway.rememberSearch(field, term));
  }

  public async forget(field: SearchField, term: string): Promise<readonly string[]> {
    return await this._withGateway(async (gateway) => await gateway.forgetSearch(field, term));
  }
}
