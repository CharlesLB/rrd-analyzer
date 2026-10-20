import type { ValueOf } from '../../../../shared/types/value-of';
import type { TimeRange } from '../../../workspace/models/timeframe/timeframe';
import { INSIGHT_SCOPES, type InsightScope } from '../finding/finding.model';

export const RUN_REVEAL_DELAY_MILLISECONDS = 150;
export const RUN_TICK_MILLISECONDS = 50;
export const FLASH_MILLISECONDS = 1100;
export const RUN_STAGE_COUNT = 3;

const EXPECTED_RUN_MILLISECONDS = 1800;
const PROGRESS_BEFORE_THE_ANSWER = 0.95;
const FIRST_STAGE_LIMIT = 0.38;
const SECOND_STAGE_LIMIT = 0.74;
const KEY_SEPARATOR = '|';

export const INSIGHT_STATUSES = {
  IDLE: 'idle',
  RUNNING: 'running',
  DONE: 'done',
} as const;

export type InsightStatus = ValueOf<typeof INSIGHT_STATUSES>;

export const STALE_REASONS = {
  VIEW: 'view',
  CONFIGURATION: 'configuration',
} as const;

export type StaleReason = ValueOf<typeof STALE_REASONS>;

export const stageIndexAt = (progress: number): number => {
  if (progress < FIRST_STAGE_LIMIT) {
    return 0;
  }

  return progress < SECOND_STAGE_LIMIT ? 1 : 2;
};

export const runProgressAt = (elapsedMilliseconds: number): number => Math.min(PROGRESS_BEFORE_THE_ANSWER, elapsedMilliseconds / EXPECTED_RUN_MILLISECONDS);

export const runKeyOf = (analysisId: string, scope: InsightScope, window: TimeRange): string =>
  (scope === INSIGHT_SCOPES.VIEWPORT ? [analysisId, scope, window.fromMilliseconds, window.untilMilliseconds] : [analysisId, scope]).join(KEY_SEPARATOR);
