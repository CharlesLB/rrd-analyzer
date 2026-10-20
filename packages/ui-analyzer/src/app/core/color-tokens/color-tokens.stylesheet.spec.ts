import { THEME_COLORS, THEMELESS_COLORS } from '../../shared/constants/colors';
import { colorTokenStylesheetOf } from './color-tokens.stylesheet';

describe('colorTokenStylesheetOf', () => {
  it('colorTokenStylesheetOf, for the root, declares the themeless colors and the light theme as custom properties', () => {
    const [rootRule] = colorTokenStylesheetOf().split('\n');

    expect(rootRule).toContain(`--windowClose:${THEMELESS_COLORS.windowClose};`);
    expect(rootRule).toContain(`--bg:${THEME_COLORS.light.bg};`);
    expect(rootRule).toContain(`--insCritSurf:${THEME_COLORS.light.insCritSurf};`);
  });

  it('colorTokenStylesheetOf, when the system prefers dark, redeclares the root with the dark theme', () => {
    const stylesheet = colorTokenStylesheetOf();

    expect(stylesheet).toContain(`@media (prefers-color-scheme: dark){:root{--bg:${THEME_COLORS.dark.bg};`);
  });

  it('colorTokenStylesheetOf, for a chosen theme, declares each theme under its class', () => {
    const stylesheet = colorTokenStylesheetOf();

    expect(stylesheet).toContain(`.light{--bg:${THEME_COLORS.light.bg};`);
    expect(stylesheet).toContain(`.dark{--bg:${THEME_COLORS.dark.bg};`);
  });
});
