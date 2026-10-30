import { inject, Service, signal } from '@angular/core';
import { BuildRepository } from '../../data-access/build-repository/build.repository';

@Service()
export class BuildStore {
  private readonly _repository = inject(BuildRepository);

  private readonly _summaryState = signal<string | undefined>(undefined);
  private readonly _sharesSessionsState = signal(false);
  private readonly _loading: { request?: Promise<void> } = {};

  public readonly summary = this._summaryState.asReadonly();
  public readonly sharesSessions = this._sharesSessionsState.asReadonly();

  public async load(): Promise<void> {
    this._loading.request ??= this._read();

    await this._loading.request;
  }

  private async _read(): Promise<void> {
    try {
      const { summary, sharesSessions } = await this._repository.build();

      this._summaryState.set(summary);
      this._sharesSessionsState.set(sharesSessions);
    } catch {
      this._loading.request = undefined;
    }
  }
}
