import { DOCUMENT, type EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { colorTokenStylesheetOf } from './color-tokens.stylesheet';

const STYLE_ELEMENT = 'style';

const installColorTokens = (document: Document): void => {
  const stylesheet = document.createElement(STYLE_ELEMENT);

  stylesheet.textContent = colorTokenStylesheetOf();
  document.head.append(stylesheet);
};

export const provideColorTokens = (): EnvironmentProviders => provideAppInitializer(() => installColorTokens(inject(DOCUMENT)));
