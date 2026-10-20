import { SERIES_COLORS } from '../../constants/colors';

export const paletteColorAt = (index: number): string => SERIES_COLORS[((index % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length];
