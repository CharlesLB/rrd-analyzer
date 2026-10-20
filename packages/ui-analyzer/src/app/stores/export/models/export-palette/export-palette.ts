import { EXPORT_COLORS } from '../../../../shared/constants/colors';
import type { Severity } from '../../../insights/models/finding/finding.model';

export type ExportPalette = {
  readonly background: string;
  readonly card: string;
  readonly line: string;
  readonly grid: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly severities: Readonly<Record<Severity, string>>;
};

export const LIGHT_EXPORT_PALETTE: ExportPalette = EXPORT_COLORS.light;

export const DARK_EXPORT_PALETTE: ExportPalette = EXPORT_COLORS.dark;
