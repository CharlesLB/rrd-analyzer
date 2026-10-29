import type { LogField } from '../log-field/log-field';
import type { LogMapping } from '../log-mapping/log-mapping';
import type { TypeColors } from '../log-severity/log-severity';
import type { LogRecord } from '../log-source/log-source';
import type { LogFileSummary } from '../log-state/log-state';
import type { LogTimeline } from '../log-timeline/log-timeline';

export type LoadedLogs = {
  readonly source: File;
  readonly records: readonly LogRecord[];
  readonly notes: readonly string[];
  readonly fields: readonly LogField[];
  readonly detectedMapping: LogMapping;
};

export type Placement = {
  readonly mapping: LogMapping;
  readonly timeline: LogTimeline;
};

export type LogsSnapshot = {
  readonly file: LogFileSummary;
  readonly loaded: LoadedLogs;
  readonly draftMapping: LogMapping;
  readonly placement: Placement | null;
  readonly chosenColors: TypeColors;
  readonly hiddenTypes: ReadonlySet<string>;
  readonly isShown: boolean;
};
