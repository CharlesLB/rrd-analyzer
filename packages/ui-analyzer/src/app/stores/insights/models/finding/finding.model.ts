import type { ValueOf } from '../../../../shared/types/value-of';

export const INSIGHT_SCOPES = {
  ALL: 'all',
  VIEWPORT: 'viewport',
} as const;

export type InsightScope = ValueOf<typeof INSIGHT_SCOPES>;

export const SEVERITIES = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
} as const;

export type Severity = ValueOf<typeof SEVERITIES>;

export const EVIDENCE_DIRECTIONS = {
  RISING: 'rising',
  FALLING: 'falling',
  TREND: 'trend',
  GAP: 'gap',
  RESET: 'reset',
  FLAT: 'flat',
} as const;

export type EvidenceDirection = ValueOf<typeof EVIDENCE_DIRECTIONS>;

type CausePart = {
  readonly text: string;
  readonly isEmphasized: boolean;
};

export type Evidence = {
  readonly semantic: string;
  readonly seriesId: string;
  readonly source: string;
  readonly direction: EvidenceDirection;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly fromValue: number | null;
  readonly toValue: number | null;
  readonly unit: string;
  readonly spark: readonly (number | null)[];
};

export type Finding = {
  readonly id: string;
  readonly severity: Severity;
  readonly isInferred: boolean;
  readonly match: string;
  readonly title: string;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly cause: readonly CausePart[];
  readonly evidence: readonly Evidence[];
};

export type EvidenceJump = {
  readonly finding: Finding;
  readonly evidence: Evidence;
};

export type InsightsReport = {
  readonly configurationStamp: string;
  readonly scope: InsightScope;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly unclassifiedLabels: readonly string[];
  readonly findings: readonly Finding[];
};
