import type { ValueOf } from '../../../../shared/types/value-of';

export const SEARCH_FIELDS = {
  LIBRARY: 'library',
  CHART_LIBRARY: 'chart-library',
  LOG_DETAIL: 'log-detail',
} as const;

export type SearchField = ValueOf<typeof SEARCH_FIELDS>;

export type SearchHistories = Readonly<Record<SearchField, readonly string[]>>;

export const NO_SEARCH_HISTORIES: SearchHistories = {
  [SEARCH_FIELDS.LIBRARY]: [],
  [SEARCH_FIELDS.CHART_LIBRARY]: [],
  [SEARCH_FIELDS.LOG_DETAIL]: [],
};
