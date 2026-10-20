import * as R from 'remeda';
import { emptyElement, SVG_TAGS, textElement } from '../../../../shared/utils/svg-markup/svg-markup.util';
import { coordinateOf } from '../../../../shared/utils/svg-path/svg-path.util';
import type { Finding, Severity } from '../../../insights/models/finding/finding.model';
import { spanOf, type TimeRange } from '../../../workspace/models/timeframe/timeframe';
import { BOLD_WEIGHT, type PlotArea, type PlotFrame } from '../export-layout/export-layout';
import type { ExportDocumentRequest } from '../export-request/export-request';

const MAXIMUM_BAND_FRACTION = 0.5;
const MINIMUM_BAND_WIDTH = 2;
const BAND_FILL_OPACITY = 0.12;
const BAND_RULE_HEIGHT = 3;
const MINIMUM_LABELLED_BAND_WIDTH = 54;
const BAND_LABEL_INSET = 6;
const BAND_LABEL_BASELINE_DROP = 20;
const BAND_LABEL_FONT_SIZE = 12;

export type ShadedBand = {
  readonly severity: Severity;
  readonly start: number;
  readonly end: number;
};

export const shadedBandsOf = (findings: readonly Finding[], visibleWindow: TimeRange): readonly ShadedBand[] => {
  const span = spanOf(visibleWindow);

  return R.pipe(
    findings,
    R.map((finding) => ({
      severity: finding.severity,
      start: (finding.fromMilliseconds - visibleWindow.fromMilliseconds) / span,
      end: (finding.untilMilliseconds - visibleWindow.fromMilliseconds) / span,
    })),
    R.filter((band) => band.end > 0 && band.start < 1),
    R.map((band) => ({ ...band, start: Math.max(0, band.start), end: Math.min(1, band.end) })),
    R.filter((band) => band.end - band.start <= MAXIMUM_BAND_FRACTION),
  );
};

export const bandsOf = (
  bands: readonly ShadedBand[],
  plot: PlotArea,
  frame: PlotFrame,
  request: ExportDocumentRequest,
  isFirstChart: boolean,
): readonly string[] =>
  R.flatMap(bands, (band) => {
    const color = request.palette.severities[band.severity];
    const x = frame.left + band.start * frame.width;
    const width = Math.max(MINIMUM_BAND_WIDTH, (band.end - band.start) * frame.width);
    const placement = { x: coordinateOf(x), y: coordinateOf(plot.top), width: coordinateOf(width) };

    const label =
      isFirstChart && width > MINIMUM_LABELLED_BAND_WIDTH
        ? [
            textElement(
              {
                x: coordinateOf(x + BAND_LABEL_INSET),
                y: coordinateOf(plot.top + BAND_LABEL_BASELINE_DROP),
                'font-size': BAND_LABEL_FONT_SIZE,
                'font-weight': BOLD_WEIGHT,
                fill: color,
              },
              request.texts.severities[band.severity],
            ),
          ]
        : [];

    return [
      emptyElement(SVG_TAGS.RECT, { ...placement, height: coordinateOf(plot.height), fill: color, 'fill-opacity': BAND_FILL_OPACITY }),
      emptyElement(SVG_TAGS.RECT, { ...placement, height: BAND_RULE_HEIGHT, fill: color }),
      ...label,
    ];
  });
