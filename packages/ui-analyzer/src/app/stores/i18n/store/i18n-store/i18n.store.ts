import { computed, Service, signal } from '@angular/core';
import { DEFAULT_LOCALE, type Locale, messagesFor } from '@rrd-analyzer/shared';

@Service()
export class I18nStore {
  private readonly _localeState = signal<Locale>(DEFAULT_LOCALE);

  public readonly locale = this._localeState.asReadonly();
  public readonly texts = computed(() => messagesFor(this._localeState()));

  public setLocale(locale: Locale): void {
    this._localeState.set(locale);
  }
}
