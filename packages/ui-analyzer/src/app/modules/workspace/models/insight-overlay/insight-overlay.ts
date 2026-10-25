import * as R from 'remeda';
import { coordinateOf } from '../../../../shared/utils/svg-path/svg-path.util';
import { EVIDENCE_DIRECTIONS, type Finding } from '../../../../stores/insights/models/finding/finding.model';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';
import { PLOT_WIDTH, plotXOf } from '../plot-geometry/plot-geometry';
import { SEVERITY_TONES } from '../severity-tone/severity-tone';

const FULL_OPACITY = '1';
const OPEN_BAND_OPACITY = 1;
const RESTING_BAND_OPACITY = 0.3;
const MARK_OPACITY = '0.45';
const DIMMED_MARK_OPACITY = '0.15';
const MINIMUM_BAND_WIDTH = 1;
const OPACITY_DECIMALS = 2;
const NO_STROKE = 'none';

type InsightBand = {
  readonly x: string;
  readonly width: string;
  readonly fill: string;
  readonly opacity: string;
  readonly stroke: string;
};

type InsightMark = {
  readonly x: string;
  readonly color: string;
  readonly opacity: string;
};

export type InsightOverlays = {
  readonly bands: readonly InsightBand[];
  readonly marks: readonly InsightMark[];
};

type OverlayFocus = {
  readonly isPanelOpen: boolean;
  readonly hoveredFindingId: string | null;
  readonly flashingFindingId: string | null;
};

export const NO_OVERLAYS: InsightOverlays = { bands: [], marks: [] };

const isElsewhere = (finding: Finding, focus: OverlayFocus): boolean => focus.hoveredFindingId !== null && focus.hoveredFindingId !== finding.id;

const bandOf = (finding: Finding, visibleWindow: TimeRange, focus: OverlayFocus): InsightBand | null => {
  const start = Math.max(0, plotXOf(finding.fromMilliseconds, visibleWindow));
  const end = Math.min(PLOT_WIDTH, plotXOf(finding.untilMilliseconds, visibleWindow));

  if (end <= 0 || start >= PLOT_WIDTH || end - start < MINIMUM_BAND_WIDTH) {
    return null;
  }

  const tone = SEVERITY_TONES[finding.severity];
  const isFlashing = focus.flashingFindingId === finding.id;
  const opacity = focus.isPanelOpen && !isElsewhere(finding, focus) ? OPEN_BAND_OPACITY : RESTING_BAND_OPACITY;

  return {
    x: coordinateOf(start),
    width: coordinateOf(end - start),
    fill: tone.band,
    opacity: isFlashing ? FULL_OPACITY : opacity.toFixed(OPACITY_DECIMALS),
    stroke: isFlashing ? tone.foreground : NO_STROKE,
  };
};

const marksOf = (finding: Finding, visibleWindow: TimeRange, focus: OverlayFocus): readonly InsightMark[] => {
  const tone = SEVERITY_TONES[finding.severity];
  const opacity = isElsewhere(finding, focus) ? DIMMED_MARK_OPACITY : MARK_OPACITY;

  return R.pipe(
    finding.evidence,
    R.flatMap((evidence) =>
      evidence.direction === EVIDENCE_DIRECTIONS.RISING ? [evidence.fromMilliseconds, evidence.untilMilliseconds] : [evidence.fromMilliseconds],
    ),
    R.map((instant) => plotXOf(instant, visibleWindow)),
    R.filter((x) => x >= 0 && x <= PLOT_WIDTH),
    R.map((x) => ({ x: coordinateOf(x), color: tone.foreground, opacity })),
  );
};

type ShadedFinding = {
  readonly finding: Finding;
  readonly band: InsightBand;
};

const shadedFindingOf = (finding: Finding, visibleWindow: TimeRange, focus: OverlayFocus): ShadedFinding | null => {
  const band = bandOf(finding, visibleWindow, focus);

  return band === null ? null : { finding, band };
};

export const insightOverlaysOf = (findings: readonly Finding[], visibleWindow: TimeRange, focus: OverlayFocus): InsightOverlays => {
  const shaded = R.pipe(
    findings,
    R.map((finding) => shadedFindingOf(finding, visibleWindow, focus)),
    R.filter(R.isNonNullish),
  );

  return {
    bands: R.map(shaded, (shading) => shading.band),
    marks: focus.isPanelOpen ? R.flatMap(shaded, (shading) => marksOf(shading.finding, visibleWindow, focus)) : NO_OVERLAYS.marks,
  };
};
