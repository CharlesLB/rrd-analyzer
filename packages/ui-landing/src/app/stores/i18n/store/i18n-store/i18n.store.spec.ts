import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { I18nStore } from './i18n.store';

describe('I18nStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('starts in English and reads the landing texts from the English catalogue', () => {
    const store = TestBed.inject(I18nStore);

    expect(store.locale()).toBe('en');
    expect(store.texts().common.productName).toBe('RRD Analyzer');
  });

  it('keeps the texts on the locale that was set', () => {
    const store = TestBed.inject(I18nStore);

    store.setLocale('en');

    expect(store.texts().download.yourSystem).toBe('Your system');
  });

  it('writes no em dash anywhere, as the copy of the site promises', () => {
    const catalogue = JSON.stringify(TestBed.inject(I18nStore).texts());

    expect(catalogue).not.toContain('—');
  });
});
