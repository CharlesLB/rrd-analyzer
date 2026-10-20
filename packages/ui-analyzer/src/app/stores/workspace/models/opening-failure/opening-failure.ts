export type MissingSource = {
  readonly name: string;
  readonly path: string;
};

export type OpeningFailure = {
  readonly missingSources: readonly MissingSource[];
};
