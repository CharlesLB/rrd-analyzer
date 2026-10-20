import { dataUrlOf } from '../blob-encoding/blob-encoding.util';

const VARIABLE_WEIGHT_RANGE = '200 1000';
const WOFF2_FORMAT = 'woff2';

export type EmbeddedFont = {
  readonly family: string;
  readonly url: string;
};

export const embeddedFontFaceOf = async (font: EmbeddedFont): Promise<string> => {
  const response = await fetch(font.url);

  if (!response.ok) {
    throw new Error(`the font at ${font.url} answered ${response.status}`);
  }

  const source = await dataUrlOf(await response.blob());

  return `@font-face{font-family:'${font.family}';font-weight:${VARIABLE_WEIGHT_RANGE};src:url(${source}) format('${WOFF2_FORMAT}')}`;
};
