import { DEFAULT_LOCALE } from '@rrd-analyzer/shared';

const COUNT_FORMAT = new Intl.NumberFormat(DEFAULT_LOCALE);

export const formatCount = (count: number): string => COUNT_FORMAT.format(count);
