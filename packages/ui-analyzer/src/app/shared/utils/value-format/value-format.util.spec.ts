import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { formatCompactValue, formatValue, isPercentUnit } from './value-format.util';

const units = messagesFor().units;

describe('formatValue', () => {
  it('renders bytes with binary prefixes, two decimals below ten and one above', () => {
    expect(formatValue(512, 'B', units)).toBe('512.0 B');
    expect(formatValue(4.73 * 1024 ** 3, 'B', units)).toBe('4.73 GiB');
    expect(formatValue(5.27 * 1024 ** 3, 'B', units)).toBe('5.27 GiB');
    expect(formatValue(-5 * 1024 ** 2, 'B', units)).toBe('-5.00 MiB');
    expect(formatValue(0, 'B', units)).toBe('0.00 B');
  });

  it('renders percentages with a single decimal and no space', () => {
    expect(formatValue(35.84, '%', units)).toBe('35.8%');
    expect(formatValue(100, '%', units)).toBe('100.0%');
  });

  it('abbreviates large magnitudes and appends the unit after a space', () => {
    expect(formatValue(1_315.2, 'req/s', units)).toBe('1315 req/s');
    expect(formatValue(1_080_000, '', units)).toBe('1.08M');
    expect(formatValue(14_552, 'pkt/s', units)).toBe('14.6k pkt/s');
    expect(formatValue(3.21, 'ms', units)).toBe('3.21 ms');
    expect(formatValue(0.5, 'ms', units)).toBe('0.500 ms');
  });

  it('keeps a magnitude past the billions readable, in trillions and then in powers of ten', () => {
    expect(formatValue(2.5e12, '', units)).toBe('2.50T');
    expect(formatValue(-2.5e12, 'req', units)).toBe('-2.50T req');
    expect(formatValue(3e18, '', units)).toBe('3.00e+18');
    expect(formatCompactValue(2.5e12, units)).toBe('2.5T');
    expect(formatValue(3 * 1024 ** 5, 'B', units)).toBe('3.00 PiB');
  });

  it('writes a tiny value that is not zero in powers of ten instead of rounding it to zero', () => {
    expect(formatValue(0.0004, 's', units)).toBe('4.0e-4 s');
    expect(formatValue(-0.0004, '', units)).toBe('-4.0e-4');
    expect(formatCompactValue(0.004, units)).toBe('4.0e-3');
    expect(formatValue(0, 'ms', units)).toBe('0.000 ms');
    expect(formatCompactValue(0, units)).toBe('0.00');
    expect(formatValue(3e-16, '', units)).toBe('0.000');
  });

  it('shows n/a for a hole or a non-finite value', () => {
    expect(formatValue(null, '%', units)).toBe('n/a');
    expect(formatValue(Number.NaN, 'B', units)).toBe('n/a');
  });

  it('shows n/a in the compact form too for a hole or a non-finite value', () => {
    expect(formatCompactValue(null, units)).toBe('n/a');
    expect(formatCompactValue(undefined, units)).toBe('n/a');
    expect(formatCompactValue(Number.POSITIVE_INFINITY, units)).toBe('n/a');
  });
});

describe('isPercentUnit', () => {
  it('recognises only the percent unit', () => {
    expect(isPercentUnit('%')).toBe(true);
    expect(isPercentUnit('ms')).toBe(false);
  });
});
