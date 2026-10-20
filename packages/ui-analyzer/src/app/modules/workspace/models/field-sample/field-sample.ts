import { formatPlural, type PluralForms } from '@rrd-analyzer/shared';
import { truncated } from '../../../../stores/logs/models/log-validation/log-validation';

const SAMPLE_TEXT_LENGTH = 44;
const NESTED_OBJECT_SAMPLE = '{…}';

export const fieldSampleOf = (value: unknown, itemCount: PluralForms): string => {
  if (typeof value === 'string') {
    return `"${truncated(value, SAMPLE_TEXT_LENGTH)}"`;
  }

  if (Array.isArray(value)) {
    return formatPlural(itemCount, value.length);
  }

  return typeof value === 'object' && value !== null ? NESTED_OBJECT_SAMPLE : String(value);
};
