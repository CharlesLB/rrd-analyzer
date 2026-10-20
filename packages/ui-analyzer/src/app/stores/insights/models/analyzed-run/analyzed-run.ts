import type { TimeRange } from '../../../workspace/models/timeframe/timeframe';
import type { InsightScope } from '../finding/finding.model';

export type AnalyzedRun = {
  readonly ranAtMilliseconds: number;
  readonly scope: InsightScope;
  readonly window: TimeRange;
  readonly unclassifiedLabels: readonly string[];
};
