import { computed, Service, signal } from '@angular/core';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@rrd-analyzer/shared';
import { ENGLISH_MESSAGES } from '../../models/english-messages/english.messages';
import type { Messages } from '../../models/messages/messages.model';

const CATALOGUES: Readonly<Record<Locale, Messages>> = {
  [LOCALES.ENGLISH]: ENGLISH_MESSAGES,
};

@Service()
export class I18nStore {
  private readonly _localeState = signal<Locale>(DEFAULT_LOCALE);

  public readonly locale = this._localeState.asReadonly();
  public readonly texts = computed(() => CATALOGUES[this._localeState()]);

  public setLocale(locale: Locale): void {
    this._localeState.set(locale);
  }
}
