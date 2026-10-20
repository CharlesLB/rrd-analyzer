const PERCENT_PER_WHOLE = 100;
const PERCENT_SIGN = '%';
const POSITION_DECIMALS = 2;

export const percentOf = (fraction: number, decimals: number = POSITION_DECIMALS): string =>
  `${(fraction * PERCENT_PER_WHOLE).toFixed(decimals)}${PERCENT_SIGN}`;
