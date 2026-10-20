import * as R from 'remeda';
import type { ValueOf } from '../../types/value-of';

export const SUGGESTION_STEPS = {
  NEXT: 1,
  PREVIOUS: -1,
} as const;

export type SuggestionStep = ValueOf<typeof SUGGESTION_STEPS>;

const NO_SUGGESTIONS = 0;
const FIRST_SUGGESTION = 0;

const foldedOf = (term: string): string => term.trim().toLowerCase();

export const suggestionsOf = (history: readonly string[], typed: string): readonly string[] => {
  const typedFolded = foldedOf(typed);

  return R.filter(history, (term) => {
    const termFolded = foldedOf(term);

    return termFolded !== typedFolded && termFolded.includes(typedFolded);
  });
};

export const isMostRecentSearch = (history: readonly string[], term: string): boolean => {
  const mostRecent = R.first(history);

  return mostRecent !== undefined && foldedOf(mostRecent) === foldedOf(term);
};

export const steppedSuggestion = (suggestionCount: number, highlighted: number | null, step: SuggestionStep): number | null => {
  if (suggestionCount === NO_SUGGESTIONS) {
    return null;
  }

  if (highlighted === null) {
    return step === SUGGESTION_STEPS.NEXT ? FIRST_SUGGESTION : suggestionCount - 1;
  }

  return (highlighted + step + suggestionCount) % suggestionCount;
};
