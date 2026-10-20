import { formatPlural, type InsightsMessages } from '@rrd-analyzer/shared';
import { formatShortTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import type { Finding } from '../../../../stores/insights/models/finding/finding.model';

const INTERVAL_SEPARATOR = ' – ';

export const findingIntervalOf = (finding: Finding): string =>
  `${formatShortTimestamp(finding.fromMilliseconds)}${INTERVAL_SEPARATOR}${formatShortTimestamp(finding.untilMilliseconds)}`;

export const findingCountLabelOf = (findings: readonly Finding[], texts: InsightsMessages): string =>
  findings.length === 0 ? texts.noFindings : formatPlural(texts.findingCount, findings.length);
