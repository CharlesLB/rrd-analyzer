import * as R from 'remeda';
import type { Analysis } from '../../../../stores/library/models/analysis/analysis.model';

export const FILTER_WORTH_SHOWING_FROM = 8;

export const isFilterWorthShowing = (analyses: readonly Analysis[]): boolean => analyses.length >= FILTER_WORTH_SHOWING_FROM;

export const analysesNamedLike = (analyses: readonly Analysis[], typed: string): readonly Analysis[] => {
  const wanted = typed.trim().toLocaleLowerCase();

  return wanted === '' ? analyses : R.filter(analyses, (analysis) => analysis.name.toLocaleLowerCase().includes(wanted));
};
