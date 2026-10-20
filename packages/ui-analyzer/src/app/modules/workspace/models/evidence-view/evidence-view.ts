import { formatMessage, type InsightsMessages, type UnitMessages } from '@rrd-analyzer/shared';
import { formatClockTime, formatDuration, formatShortTimestamp, startOfDay } from '../../../../shared/utils/date-format/date-format.util';
import { sampleExtentOf, scaledY, type VerticalBand } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { evenlySpacedPositionOf, gappedPolylineOf } from '../../../../shared/utils/svg-path/svg-path.util';
import { formatValue } from '../../../../shared/utils/value-format/value-format.util';
import { EVIDENCE_DIRECTIONS, type Evidence, type Severity } from '../../../../stores/insights/models/finding/finding.model';
import { spanOf } from '../../../../stores/workspace/models/timeframe/timeframe';
import { MUTED_COLOR, SEVERITY_TONES } from '../severity-tone/severity-tone';

const SPARK_WIDTH = 60;
const SPARK_HEIGHT = 20;
const SPARK_TOP = 2;
const SPARK_DRAWABLE_HEIGHT = 16;
const SMALLEST_RANGE = 1e-9;
const SPARK_BAND: VerticalBand = { top: SPARK_TOP, height: SPARK_DRAWABLE_HEIGHT };
const SPARK_BASELINE = SPARK_TOP + SPARK_DRAWABLE_HEIGHT;
const FLAT_SPARK_PATH = `M0 ${SPARK_BASELINE} L${SPARK_WIDTH} ${SPARK_BASELINE}`;

export const EVIDENCE_SPARK_VIEW_BOX = `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`;
const SPAN_ARROW = ' → ';

const EVIDENCE_GLYPHS = {
  GAP: '⤓',
  TREND: '↗',
  RISE: '↑',
  FALL: '↓',
  FLAT: '→',
} as const;

const DIRECTION_COLORS = {
  RISE: 'var(--insRise)',
  FALL: 'var(--insFall)',
  FLAT: 'var(--tx2)',
} as const;

const isOutage = (evidence: Evidence): boolean => evidence.direction === EVIDENCE_DIRECTIONS.GAP || evidence.direction === EVIDENCE_DIRECTIONS.RESET;

const isRise = (evidence: Evidence): boolean => evidence.fromValue !== null && evidence.toValue !== null && evidence.toValue >= evidence.fromValue;

export const evidenceGlyphOf = (evidence: Evidence): string => {
  if (isOutage(evidence)) {
    return EVIDENCE_GLYPHS.GAP;
  }

  if (evidence.direction === EVIDENCE_DIRECTIONS.TREND) {
    return EVIDENCE_GLYPHS.TREND;
  }

  if (evidence.direction === EVIDENCE_DIRECTIONS.FLAT) {
    return EVIDENCE_GLYPHS.FLAT;
  }

  return isRise(evidence) ? EVIDENCE_GLYPHS.RISE : EVIDENCE_GLYPHS.FALL;
};

export const evidenceGlyphColorOf = (evidence: Evidence, severity: Severity): string => {
  if (isOutage(evidence)) {
    return SEVERITY_TONES[severity].foreground;
  }

  if (evidence.direction === EVIDENCE_DIRECTIONS.FLAT) {
    return DIRECTION_COLORS.FLAT;
  }

  return isRise(evidence) ? DIRECTION_COLORS.RISE : DIRECTION_COLORS.FALL;
};

export type EvidenceBadge = {
  readonly color: string;
  readonly background: string;
  readonly border: string;
};

const UNPLOTTED_BADGE: EvidenceBadge = { color: 'var(--tx2)', background: 'var(--surf2)', border: 'var(--line)' };

export const evidenceBadgeOf = (plottedColor: string | null): EvidenceBadge =>
  plottedColor === null
    ? UNPLOTTED_BADGE
    : {
        color: `color-mix(in srgb,${plottedColor} 55%,var(--tx))`,
        background: `color-mix(in srgb,${plottedColor} 12%,transparent)`,
        border: `color-mix(in srgb,${plottedColor} 45%,transparent)`,
      };

export const sparkColorOf = (plottedColor: string | null): string => plottedColor ?? MUTED_COLOR;

export const evidenceSpanOf = (evidence: Evidence): string => {
  if (isOutage(evidence)) {
    return formatShortTimestamp(evidence.fromMilliseconds);
  }

  const until =
    startOfDay(evidence.fromMilliseconds) === startOfDay(evidence.untilMilliseconds)
      ? formatClockTime(evidence.untilMilliseconds)
      : formatShortTimestamp(evidence.untilMilliseconds);

  return `${formatShortTimestamp(evidence.fromMilliseconds)}${SPAN_ARROW}${until}`;
};

export const evidenceValuesOf = (evidence: Evidence, texts: InsightsMessages, units: UnitMessages): string =>
  isOutage(evidence)
    ? formatMessage(texts.gapSpan, { duration: formatDuration(spanOf(evidence), units) })
    : `${formatValue(evidence.fromValue, evidence.unit, units)}${SPAN_ARROW}${formatValue(evidence.toValue, evidence.unit, units)}`;

export const sparkPathOf = (points: readonly (number | null)[]): string => {
  const extent = sampleExtentOf(points);

  if (extent === null) {
    return FLAT_SPARK_PATH;
  }

  const range = Math.max(SMALLEST_RANGE, extent.highest - extent.lowest);

  return gappedPolylineOf(points, (point, index) => ({
    x: evenlySpacedPositionOf(index, points.length, SPARK_WIDTH),
    y: scaledY(point - extent.lowest, { lowest: 0, highest: range }, SPARK_BAND),
  }));
};
