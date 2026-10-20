import { minLength, schema } from '@angular/forms/signals';
import * as R from 'remeda';
import type { NewAnalysisDraft, PendingSource } from '../analysis/analysis.model';
import { stripSourceExtension } from '../source-file/source-file';

const MINIMUM_SOURCE_COUNT = 1;
const ONE_SOURCE = 1;

export const EMPTY_NEW_ANALYSIS_DRAFT: NewAnalysisDraft = { name: '', sources: [] };

export const newAnalysisDraftSchema = schema<NewAnalysisDraft>((draft) => {
  minLength(draft.sources, MINIMUM_SOURCE_COUNT);
});

export const sourceIdentityOf = (source: PendingSource): string => source.path || source.name;

export const sourcesNotListed = (draft: NewAnalysisDraft, candidates: readonly PendingSource[]): readonly PendingSource[] => {
  const known = new Set(R.map(draft.sources, sourceIdentityOf));

  return R.pipe(
    candidates,
    R.uniqueBy(sourceIdentityOf),
    R.filter((source) => !known.has(sourceIdentityOf(source))),
  );
};

export const withSourcesAdded = (draft: NewAnalysisDraft, candidates: readonly PendingSource[]): NewAnalysisDraft => ({
  ...draft,
  sources: [...draft.sources, ...sourcesNotListed(draft, candidates)],
});

export const withoutSourceAt = (draft: NewAnalysisDraft, index: number): NewAnalysisDraft => ({
  ...draft,
  sources: R.filter(draft.sources, (_source, position) => position !== index),
});

export const withoutSources = (draft: NewAnalysisDraft): NewAnalysisDraft => ({ ...draft, sources: [] });

export const analysisNameOf = (draft: NewAnalysisDraft, untitledName: string): string => {
  const typed = draft.name.trim();
  const [onlySource] = draft.sources;

  if (typed !== '') {
    return typed;
  }

  return draft.sources.length === ONE_SOURCE && onlySource !== undefined ? stripSourceExtension(onlySource.name) || untitledName : untitledName;
};
