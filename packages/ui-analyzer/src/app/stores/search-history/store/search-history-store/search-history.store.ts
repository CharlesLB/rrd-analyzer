import { inject, Service, signal } from '@angular/core';
import { isMostRecentSearch } from '../../../../shared/utils/search-suggestions/search-suggestions.util';
import { SearchHistoryRepository } from '../../data-access/search-history-repository/search-history.repository';
import { NO_SEARCH_HISTORIES, type SearchField, type SearchHistories } from '../../models/search-field/search-field';

const NO_TERM = '';

@Service()
export class SearchHistoryStore {
  private readonly _repository = inject(SearchHistoryRepository);

  private readonly _historiesState = signal<SearchHistories>(NO_SEARCH_HISTORIES);
  private readonly _loadedFields = new Set<SearchField>();
  private readonly _latestWrites = new Map<SearchField, number>();
  private readonly _writes = { count: 0 };

  public readonly histories = this._historiesState.asReadonly();

  public async load(field: SearchField): Promise<boolean> {
    if (this._loadedFields.has(field)) {
      return true;
    }

    this._loadedFields.add(field);
    const writesWhenAsked = this._latestWrites.get(field);

    try {
      const history = await this._repository.historyOf(field);

      if (this._latestWrites.get(field) === writesWhenAsked) {
        this._keep(field, history);
      }

      return true;
    } catch {
      this._loadedFields.delete(field);

      return false;
    }
  }

  public async remember(field: SearchField, term: string): Promise<boolean> {
    const trimmed = term.trim();

    if (trimmed === NO_TERM || isMostRecentSearch(this._historiesState()[field], trimmed)) {
      return true;
    }

    return await this._write(field, async () => await this._repository.remember(field, trimmed));
  }

  public async forget(field: SearchField, term: string): Promise<boolean> {
    return await this._write(field, async () => await this._repository.forget(field, term));
  }

  private async _write(field: SearchField, write: () => Promise<readonly string[]>): Promise<boolean> {
    const writeNumber = ++this._writes.count;

    this._latestWrites.set(field, writeNumber);

    try {
      const history = await write();

      if (this._latestWrites.get(field) === writeNumber) {
        this._keep(field, history);
      }

      return true;
    } catch {
      return false;
    }
  }

  private _keep(field: SearchField, history: readonly string[]): void {
    this._historiesState.update((histories) => ({ ...histories, [field]: history }));
  }
}
