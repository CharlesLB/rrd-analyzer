import { MILLISECONDS_PER_SECOND } from '@rrd-analyzer/shared';

const WHOLE_NUMBER_TEXT = /^\d+$/;
const DECIMAL_NUMBER_TEXT = /^\d+\.\d+$/;
const FOUR_DIGITS = /\d{4}/;
const FRACTION_AFTER_A_COMMA = /(\d{2}:\d{2}:\d{2}),(\d)/;
const FRACTION_AFTER_A_POINT = '$1.$2';
const NANOSECONDS_FLOOR = 1e17;
const MICROSECONDS_FLOOR = 1e14;
const MILLISECONDS_FLOOR = 1e11;
const SECONDS_FLOOR = 1e8;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const MICROSECONDS_PER_MILLISECOND = 1000;

const epochMillisecondsOf = (epoch: number): number | null => {
  if (!Number.isFinite(epoch)) {
    return null;
  }

  if (epoch > NANOSECONDS_FLOOR) {
    return epoch / NANOSECONDS_PER_MILLISECOND;
  }

  if (epoch > MICROSECONDS_FLOOR) {
    return epoch / MICROSECONDS_PER_MILLISECOND;
  }

  if (epoch > MILLISECONDS_FLOOR) {
    return epoch;
  }

  return epoch > SECONDS_FLOOR ? epoch * MILLISECONDS_PER_SECOND : null;
};

const isEpochText = (text: string): boolean => WHOLE_NUMBER_TEXT.test(text) || DECIMAL_NUMBER_TEXT.test(text);

const writtenTimestampOf = (written: string): number | null => {
  const text = written.trim();

  if (isEpochText(text)) {
    return epochMillisecondsOf(Number.parseFloat(text));
  }

  const parsed = FOUR_DIGITS.test(text) ? Date.parse(text.replace(FRACTION_AFTER_A_COMMA, FRACTION_AFTER_A_POINT)) : Number.NaN;

  return Number.isNaN(parsed) ? null : parsed;
};

export const parseLogTimestamp = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return epochMillisecondsOf(value);
  }

  return typeof value === 'string' ? writtenTimestampOf(value) : null;
};

export const isWrittenDate = (value: unknown): boolean => typeof value === 'string' && !isEpochText(value.trim()) && writtenTimestampOf(value) !== null;
