import { TestBed } from '@angular/core/testing';
import { LOCALES, messagesFor } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nStore } from './i18n.store';

describe('I18nStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('starts on english and serves that catalogue', () => {
    const store = TestBed.inject(I18nStore);

    expect(store.locale()).toBe(LOCALES.ENGLISH);
    expect(store.texts()).toBe(messagesFor(LOCALES.ENGLISH));
  });

  it('serves the catalogue of whichever locale is selected', () => {
    const store = TestBed.inject(I18nStore);
    store.setLocale(LOCALES.ENGLISH);

    expect(store.texts().application.name).toBe('RRD Analyzer');
  });
});
