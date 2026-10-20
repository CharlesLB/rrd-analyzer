import type { ValueOf } from '../../../../shared/types/value-of';
import { formatFullTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import type { TimeRange } from '../../../workspace/models/timeframe/timeframe';

export const EXPORT_EXTENSIONS = {
  PNG: 'png',
  SVG: 'svg',
} as const;

export type ExportExtension = ValueOf<typeof EXPORT_EXTENSIONS>;

const FILE_PREFIX = 'rrd';
const NAME_SEPARATOR = '_';
const SLUG_SEPARATOR = '-';
const NON_ALPHANUMERIC_RUNS = /[^a-z0-9]+/g;
const EDGE_SEPARATORS = /^-|-$/g;
const NON_DIGITS = /\D/g;

const slugOf = (name: string): string => name.toLowerCase().replace(NON_ALPHANUMERIC_RUNS, SLUG_SEPARATOR).replace(EDGE_SEPARATORS, '');

const compactTimestampOf = (milliseconds: number): string => formatFullTimestamp(milliseconds).replace(NON_DIGITS, '');

export const exportFileNameOf = (seriesNames: readonly string[], visibleWindow: TimeRange, extension: ExportExtension): string => {
  const [onlyName] = seriesNames;
  const slug = seriesNames.length === 1 && onlyName !== undefined ? [slugOf(onlyName)] : [];
  const parts = [FILE_PREFIX, ...slug, compactTimestampOf(visibleWindow.fromMilliseconds), compactTimestampOf(visibleWindow.untilMilliseconds)];

  return `${parts.join(NAME_SEPARATOR)}.${extension}`;
};
