import { SEVERITIES, type Severity } from '../../../../stores/insights/models/finding/finding.model';

export const MUTED_COLOR = 'var(--mut)';

export type SeverityTone = {
  readonly foreground: string;
  readonly surface: string;
  readonly band: string;
};

export const SEVERITY_TONES: Readonly<Record<Severity, SeverityTone>> = {
  [SEVERITIES.CRITICAL]: { foreground: 'var(--insCritFg)', surface: 'var(--insCritSurf)', band: 'var(--insCritBand)' },
  [SEVERITIES.WARNING]: { foreground: 'var(--insWarnFg)', surface: 'var(--insWarnSurf)', band: 'var(--insWarnBand)' },
  [SEVERITIES.INFO]: { foreground: 'var(--insInfoFg)', surface: 'var(--insInfoSurf)', band: 'var(--insInfoBand)' },
};
