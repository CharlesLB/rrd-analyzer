import { inject, Service, signal } from '@angular/core';
import { BuildRepository } from '../../data-access/build-repository/build.repository';

@Service()
export class BuildStore {
  private readonly _repository = inject(BuildRepository);

  private readonly _summaryState = signal<string | undefined>(undefined);
  private readonly _loading: { request?: Promise<void> } = {};

  public readonly summary = this._summaryState.asReadonly();

  public async load(): Promise<void> {
    this._loading.request ??= this._read();

    await this._loading.request;
  }

  private async _read(): Promise<void> {
    try {
      this._summaryState.set(await this._repository.summary());
    } catch {
      this._loading.request = undefined;
    }
  }
}
