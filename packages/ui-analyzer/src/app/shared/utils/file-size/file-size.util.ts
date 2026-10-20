import type { UnitMessages } from '@rrd-analyzer/shared';

const BYTES_PER_KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
const MEGABYTE_DECIMALS = 1;
const TENTHS_OF_A_KILOBYTE = 1;

export const WHOLE_KILOBYTES = 0;

export const formatFileSize = (bytes: number, units: UnitMessages, kilobyteDecimals: number = TENTHS_OF_A_KILOBYTE): string => {
  if (bytes < BYTES_PER_KILOBYTE) {
    return `${bytes} ${units.bytes}`;
  }

  return bytes < BYTES_PER_MEGABYTE
    ? `${(bytes / BYTES_PER_KILOBYTE).toFixed(kilobyteDecimals)} ${units.kilobytes}`
    : `${(bytes / BYTES_PER_MEGABYTE).toFixed(MEGABYTE_DECIMALS)} ${units.megabytes}`;
};
