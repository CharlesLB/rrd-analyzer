import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { provideColorTokens } from './color-tokens.provider';
import { colorTokenStylesheetOf } from './color-tokens.stylesheet';

const installedStylesheets = (): readonly HTMLStyleElement[] =>
  Array.from(document.head.querySelectorAll('style')).filter((style) => style.textContent === colorTokenStylesheetOf());

describe('provideColorTokens', () => {
  afterEach(() => {
    installedStylesheets().forEach((style) => {
      style.remove();
    });
  });

  it('provideColorTokens, as the application starts, installs the color tokens in the head of the document once', async () => {
    TestBed.configureTestingModule({ providers: [provideColorTokens()] });

    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(installedStylesheets()).toHaveLength(1);
  });
});
