import { describe, expect, it } from 'vitest';
import { isMostRecentSearch, SUGGESTION_STEPS, steppedSuggestion, suggestionsOf } from './search-suggestions.util';

const HISTORY = ['memory', 'CPU user', 'cpu system', 'disk'];

describe('suggestionsOf', () => {
  it('suggests the whole history, in its order, while nothing is typed', () => {
    expect(suggestionsOf(HISTORY, '  ')).toEqual(HISTORY);
  });

  it('suggests the terms holding what was typed, whatever its letter case', () => {
    expect(suggestionsOf(HISTORY, 'cpu')).toEqual(['CPU user', 'cpu system']);
  });

  it('leaves out the term already typed in full, which there is nothing to complete to', () => {
    expect(suggestionsOf(HISTORY, ' Memory ')).toEqual([]);
  });
});

describe('isMostRecentSearch', () => {
  it('is true for the head of the history typed in another letter case', () => {
    expect(isMostRecentSearch(HISTORY, 'MEMORY ')).toBe(true);
  });

  it('is false for a term further down the history, or for an empty history', () => {
    expect(isMostRecentSearch(HISTORY, 'disk')).toBe(false);
    expect(isMostRecentSearch([], 'disk')).toBe(false);
  });
});

describe('steppedSuggestion', () => {
  it('starts at the first suggestion going down and at the last going up', () => {
    expect(steppedSuggestion(3, null, SUGGESTION_STEPS.NEXT)).toBe(0);
    expect(steppedSuggestion(3, null, SUGGESTION_STEPS.PREVIOUS)).toBe(2);
  });

  it('goes round at either end', () => {
    expect(steppedSuggestion(3, 2, SUGGESTION_STEPS.NEXT)).toBe(0);
    expect(steppedSuggestion(3, 0, SUGGESTION_STEPS.PREVIOUS)).toBe(2);
  });

  it('highlights nothing when there is nothing to suggest', () => {
    expect(steppedSuggestion(0, null, SUGGESTION_STEPS.NEXT)).toBeNull();
  });
});
