import { MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { spanOf, type TimeRange } from '../../../workspace/models/timeframe/timeframe';
import type { Evidence, Finding } from '../finding/finding.model';

const FINDING_PADDING_RATIO = 0.35;
const MINIMUM_FINDING_PADDING = 30 * MILLISECONDS_PER_MINUTE;
const EVIDENCE_PADDING_RATIO = 0.5;
const MINIMUM_EVIDENCE_PADDING = 20 * MILLISECONDS_PER_MINUTE;

export const findingFrameOf = (finding: Finding): TimeRange => {
  const padding = Math.max(MINIMUM_FINDING_PADDING, spanOf(finding) * FINDING_PADDING_RATIO);

  return { fromMilliseconds: finding.fromMilliseconds - padding, untilMilliseconds: finding.untilMilliseconds + padding };
};

export const evidenceFrameOf = (evidence: Evidence, stepMilliseconds: number): TimeRange => {
  const padding = Math.max(MINIMUM_EVIDENCE_PADDING, spanOf(evidence) * EVIDENCE_PADDING_RATIO);

  return {
    fromMilliseconds: evidence.fromMilliseconds - padding,
    untilMilliseconds: Math.max(evidence.untilMilliseconds, evidence.fromMilliseconds + stepMilliseconds) + padding,
  };
};
