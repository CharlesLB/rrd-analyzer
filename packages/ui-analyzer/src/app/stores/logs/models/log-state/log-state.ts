import type { ValueOf } from '../../../../shared/types/value-of';

export const LOG_STATUSES = {
  NONE: 'none',
  LOADING: 'loading',
  FAILED: 'failed',
  SETUP: 'setup',
  READY: 'ready',
} as const;

export type LogStatus = ValueOf<typeof LOG_STATUSES>;

export const LOG_PANELS = {
  SETUP: 'setup',
  DETAIL: 'detail',
} as const;

export type LogPanel = ValueOf<typeof LOG_PANELS>;

export type LogFileSummary = {
  readonly name: string;
  readonly sizeBytes: number;
};

export const STEP_DIRECTIONS = {
  BACKWARD: -1,
  FORWARD: 1,
} as const;

export type StepDirection = ValueOf<typeof STEP_DIRECTIONS>;
