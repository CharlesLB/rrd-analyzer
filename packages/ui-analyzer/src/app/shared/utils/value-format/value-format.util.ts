import type { UnitMessages } from '@rrd-analyzer/shared';

const BYTE_UNIT = 'B';
const PERCENT_UNIT = '%';
const BINARY_STEP = 1024;
const BINARY_PREFIXES = ['B', 'K', 'M', 'G', 'T', 'P', 'E'] as const;
const BINARY_SUFFIX = 'iB';
const NEGATIVE_SIGN = '-';
const POWERS_OF_TEN_FROM = 1e15;
const TRILLION = 1e12;
const BILLION = 1e9;
const MILLION = 1e6;
const THOUSAND = 1e3;
const TEN_THOUSAND = 1e4;
const HUNDRED = 100;
const COMPACT_DECIMAL_LIMIT = 10;
const SMALLEST_PLAIN_MAGNITUDE = 1e-3;
const SMALLEST_PLAIN_COMPACT_MAGNITUDE = 1e-2;
const TINY_DECIMALS = 1;
const HUGE_DECIMALS = 2;

const ROUNDING_NOISE_MAGNITUDE = 1e-9;

const isTiny = (magnitude: number, smallestPlain: number): boolean => magnitude >= ROUNDING_NOISE_MAGNITUDE && magnitude < smallestPlain;

const scaleBinary = (value: number, exponent: number): { readonly value: number; readonly exponent: number } =>
  value >= BINARY_STEP && exponent < BINARY_PREFIXES.length - 1 ? scaleBinary(value / BINARY_STEP, exponent + 1) : { value, exponent };

const formatBinary = (value: number): string => {
  const scaled = scaleBinary(Math.abs(value), 0);
  const suffix = scaled.exponent === 0 ? BINARY_PREFIXES[0] : `${BINARY_PREFIXES[scaled.exponent]}${BINARY_SUFFIX}`;
  const magnitude = scaled.value.toFixed(scaled.value < COMPACT_DECIMAL_LIMIT ? 2 : 1);

  return `${value < 0 ? NEGATIVE_SIGN : ''}${magnitude} ${suffix}`;
};

type MagnitudeDecimals = {
  readonly scaled: number;
  readonly belowHundred: (magnitude: number) => number;
  readonly smallestPlain: number;
  readonly huge: number;
};

const FULL_DECIMALS: MagnitudeDecimals = {
  scaled: 2,
  belowHundred: (magnitude) => (magnitude >= 1 ? 2 : 3),
  smallestPlain: SMALLEST_PLAIN_MAGNITUDE,
  huge: HUGE_DECIMALS,
};

const COMPACT_DECIMALS: MagnitudeDecimals = {
  scaled: 1,
  belowHundred: (magnitude) => (magnitude >= COMPACT_DECIMAL_LIMIT ? 1 : 2),
  smallestPlain: SMALLEST_PLAIN_COMPACT_MAGNITUDE,
  huge: TINY_DECIMALS,
};

const formatMagnitude = (value: number, decimals: MagnitudeDecimals): string => {
  const magnitude = Math.abs(value);

  if (magnitude >= POWERS_OF_TEN_FROM) {
    return value.toExponential(decimals.huge);
  }

  if (isTiny(magnitude, decimals.smallestPlain)) {
    return value.toExponential(TINY_DECIMALS);
  }

  if (magnitude >= TRILLION) {
    return `${(value / TRILLION).toFixed(decimals.scaled)}T`;
  }

  if (magnitude >= BILLION) {
    return `${(value / BILLION).toFixed(decimals.scaled)}G`;
  }

  if (magnitude >= MILLION) {
    return `${(value / MILLION).toFixed(decimals.scaled)}M`;
  }

  if (magnitude >= TEN_THOUSAND) {
    return `${(value / THOUSAND).toFixed(1)}k`;
  }

  if (magnitude >= HUNDRED) {
    return value.toFixed(0);
  }

  return value.toFixed(decimals.belowHundred(magnitude));
};

export const formatCompactValue = (value: number | null | undefined, units: UnitMessages): string =>
  value === null || value === undefined || !Number.isFinite(value) ? units.emptyValue : formatMagnitude(value, COMPACT_DECIMALS);

export const formatValue = (value: number | null | undefined, unit: string, units: UnitMessages): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return units.emptyValue;
  }

  if (unit === BYTE_UNIT) {
    return formatBinary(value);
  }

  if (unit === PERCENT_UNIT) {
    return `${value.toFixed(1)}%`;
  }

  const rendered = formatMagnitude(value, FULL_DECIMALS);

  return unit ? `${rendered} ${unit}` : rendered;
};

export const isPercentUnit = (unit: string): boolean => unit === PERCENT_UNIT;

export const unitLabelOf = (unit: string, units: UnitMessages): string => unit || units.unitless;
