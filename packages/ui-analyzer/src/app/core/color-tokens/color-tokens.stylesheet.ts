import { MEDIA_QUERIES } from '@rrd-analyzer/ui-shared';
import { THEME_COLORS, THEMELESS_COLORS } from '../../shared/constants/colors';

type ColorTokens = Readonly<Record<string, string>>;

const ROOT_SELECTOR = ':root';
const LIGHT_THEME_SELECTOR = '.light';
const DARK_THEME_SELECTOR = '.dark';

const declarationsOf = (tokens: ColorTokens): string =>
  Object.entries(tokens)
    .map(([name, color]) => `--${name}:${color};`)
    .join('');

const ruleOf = (selector: string, tokens: ColorTokens): string => `${selector}{${declarationsOf(tokens)}}`;

export const colorTokenStylesheetOf = (): string =>
  [
    ruleOf(ROOT_SELECTOR, { ...THEMELESS_COLORS, ...THEME_COLORS.light }),
    `@media ${MEDIA_QUERIES.DARK_SYSTEM_THEME}{${ruleOf(ROOT_SELECTOR, THEME_COLORS.dark)}}`,
    ruleOf(LIGHT_THEME_SELECTOR, THEME_COLORS.light),
    ruleOf(DARK_THEME_SELECTOR, THEME_COLORS.dark),
  ].join('\n');
