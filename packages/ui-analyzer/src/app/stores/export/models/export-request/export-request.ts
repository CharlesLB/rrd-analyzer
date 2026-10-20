import type { ExportDocumentMessages, SeverityMessages, UnitMessages } from '@rrd-analyzer/shared';
import type { Finding } from '../../../insights/models/finding/finding.model';
import type { SampledLine } from '../../../workspace/models/series/series.model';
import type { TimeRange } from '../../../workspace/models/timeframe/timeframe';
import type { ExportPalette } from '../export-palette/export-palette';

export const EXPORT_COLUMNS = 960;

export type ExportChart = {
  readonly lines: readonly SampledLine[];
};

export type ExportDocumentTexts = {
  readonly brand: string;
  readonly mergedSeparator: string;
  readonly document: ExportDocumentMessages;
  readonly severities: SeverityMessages;
  readonly units: UnitMessages;
};

export type ExportDocumentRequest = {
  readonly analysisName: string;
  readonly charts: readonly ExportChart[];
  readonly window: TimeRange;
  readonly findings: readonly Finding[];
  readonly palette: ExportPalette;
  readonly exportedAtMilliseconds: number;
  readonly embeddedFontFace: string;
  readonly texts: ExportDocumentTexts;
};
