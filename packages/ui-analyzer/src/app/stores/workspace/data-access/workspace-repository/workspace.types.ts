export type WindowQuery = {
  readonly analysisId: string;
  readonly seriesIds: readonly string[];
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly columns: number;
};

export type AddedSources = {
  readonly picked: number;
  readonly added: number;
};
