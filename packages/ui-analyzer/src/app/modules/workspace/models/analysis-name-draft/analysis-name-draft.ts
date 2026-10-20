import { schema, validate } from '@angular/forms/signals';

export type AnalysisNameDraft = {
  readonly name: string;
};

export const ANALYSIS_NAME_ERRORS = {
  BLANK: 'blank-name',
} as const;

export const analysisNameDraftOf = (name: string): AnalysisNameDraft => ({ name });

export const analysisNameDraftSchema = schema<AnalysisNameDraft>((draft) => {
  validate(draft.name, ({ value }) => (value().trim() === '' ? { kind: ANALYSIS_NAME_ERRORS.BLANK } : undefined));
});

export const renamedTo = (draft: AnalysisNameDraft, currentName: string): string | null => {
  const typed = draft.name.trim();

  return typed === currentName ? null : typed;
};
