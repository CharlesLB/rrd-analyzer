export type ChartLabels = readonly string[];

export type Analysis = {
  readonly id: string;
  readonly name: string;
  readonly canvas: readonly ChartLabels[];
  readonly lastAccessedMilliseconds: number;
};

export type PendingSource = {
  readonly name: string;
  readonly path: string;
  readonly size: number;
};

export type NewAnalysisDraft = {
  readonly name: string;
  readonly sources: readonly PendingSource[];
};
