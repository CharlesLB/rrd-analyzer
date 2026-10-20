import * as R from 'remeda';
import { describe, expect, it } from 'vitest';
import type { Analysis } from '../../../../stores/library/models/analysis/analysis.model';
import { analysesNamedLike, FILTER_WORTH_SHOWING_FROM, isFilterWorthShowing } from './analysis-filter';

const named = (name: string): Analysis => ({ id: name, name, canvas: [], lastAccessedMilliseconds: 0 });
const ANALYSES = [named('Atlas prod · capacity'), named('HTTP latency review'), named('atlas replica')];

describe('analysesNamedLike', () => {
  it('analysesNamedLike keeps the analyses whose name holds what was typed, whatever its case and padding', () => {
    expect(analysesNamedLike(ANALYSES, '  ATLAS ').map((analysis) => analysis.name)).toEqual(['Atlas prod · capacity', 'atlas replica']);
  });

  it('analysesNamedLike with nothing typed keeps every analysis, in the order given', () => {
    expect(analysesNamedLike(ANALYSES, '   ')).toBe(ANALYSES);
  });

  it('analysesNamedLike with a name nothing holds keeps none', () => {
    expect(analysesNamedLike(ANALYSES, 'postgres')).toEqual([]);
  });
});

describe('isFilterWorthShowing', () => {
  it('isFilterWorthShowing only once the list is long enough to need a filter', () => {
    const manyAnalyses = R.map(R.range(0, FILTER_WORTH_SHOWING_FROM), (index) => named(`Analysis ${index}`));

    expect(isFilterWorthShowing(manyAnalyses)).toBe(true);
    expect(isFilterWorthShowing(manyAnalyses.slice(1))).toBe(false);
  });
});
