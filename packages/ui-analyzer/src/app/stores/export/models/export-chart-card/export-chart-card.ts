import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { sampleExtentOf, scaledY } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { emptyElement, SVG_TAGS, spannedTextElement, TEXT_ANCHORS, type TextSpan, textElement } from '../../../../shared/utils/svg-markup/svg-markup.util';
import { coordinateOf, evenlySpacedPositionOf, gappedPolylineOf } from '../../../../shared/utils/svg-path/svg-path.util';
import { formatValue, unitLabelOf } from '../../../../shared/utils/value-format/value-format.util';
import { chartTitleOf, type SampledLine } from '../../../workspace/models/series/series.model';
import { type RangedLine, rangedLinesOf, valueAxesOf } from '../../../workspace/models/value-axis/value-axis';
import { bandsOf, type ShadedBand } from '../export-band/export-band';
import { gridOf } from '../export-grid/export-grid';
import { BOLD_WEIGHT, chartSlotOf, EXPORT_FRAME, EXPORT_MARGIN, type PlotArea, type PlotFrame } from '../export-layout/export-layout';
import type { ExportChart, ExportDocumentRequest, ExportDocumentTexts } from '../export-request/export-request';

const CARD_RADIUS = 14;
const SWATCH_OFFSET = 26;
const SWATCH_CENTRE_DROP = 27;
const SWATCH_RADIUS = 6;
const SWATCH_SPACING = 16;
const CHART_NAME_OFFSET = 42;
const CHART_HEADING_BASELINE_DROP = 33;
const CHART_SUMMARY_INSET = 22;
const CHART_NAME_FONT_SIZE = 18;
const CHART_SUMMARY_FONT_SIZE = 15;
const LINE_STROKE_WIDTH = 2.4;
const NO_FILL = 'none';
const ROUND_JOIN = 'round';
const ONE_LINE = 1;
const FIRST_CHART = 0;

const lineSummaryOf = (line: SampledLine, texts: ExportDocumentTexts): string => {
  const extent = sampleExtentOf(line.samples);
  const unit = unitLabelOf(line.series.unit, texts.units);

  if (extent === null) {
    return formatMessage(texts.document.seriesWithoutData, { unit });
  }

  return formatMessage(texts.document.seriesSummary, {
    unit,
    last: formatValue(extent.last, line.series.unit, texts.units),
    peak: formatValue(extent.highest, line.series.unit, texts.units),
  });
};

const mergedSummaryOf = (lines: readonly SampledLine[], request: ExportDocumentRequest): readonly TextSpan[] =>
  R.flatMap(lines, (line, index) => [
    ...(index === 0 ? [] : [{ text: request.texts.document.noteSeparator, fill: request.palette.muted }]),
    { text: formatValue(sampleExtentOf(line.samples)?.last, line.series.unit, request.texts.units), fill: line.series.color },
  ]);

const summaryOf = (lines: readonly SampledLine[], baseline: string, request: ExportDocumentRequest): string => {
  const attributes = {
    x: EXPORT_FRAME.WIDTH - EXPORT_MARGIN - CHART_SUMMARY_INSET,
    y: baseline,
    'text-anchor': TEXT_ANCHORS.END,
    'font-size': CHART_SUMMARY_FONT_SIZE,
    fill: request.palette.muted,
  };

  const [onlyLine] = lines;

  return lines.length === ONE_LINE && onlyLine !== undefined
    ? textElement(attributes, lineSummaryOf(onlyLine, request.texts))
    : spannedTextElement(attributes, mergedSummaryOf(lines, request));
};

const pathOf = (line: RangedLine, plot: PlotArea, frame: PlotFrame): string =>
  emptyElement(SVG_TAGS.PATH, {
    d: gappedPolylineOf(line.samples, (value, sampleIndex) => ({
      x: frame.left + evenlySpacedPositionOf(sampleIndex, line.samples.length, frame.width),
      y: scaledY(value, line.range, plot),
    })),
    fill: NO_FILL,
    stroke: line.series.color,
    'stroke-width': LINE_STROKE_WIDTH,
    'stroke-linejoin': ROUND_JOIN,
    'stroke-linecap': ROUND_JOIN,
  });

export const chartCardOf = (
  chart: ExportChart,
  index: number,
  bands: readonly ShadedBand[],
  request: ExportDocumentRequest,
  frame: PlotFrame,
): readonly string[] => {
  const { palette } = request;
  const { top, height: chartHeight, plot } = chartSlotOf(index, request.charts.length);
  const axes = valueAxesOf(chart.lines);
  const lines = rangedLinesOf(chart.lines, axes);
  const headingBaseline = coordinateOf(top + CHART_HEADING_BASELINE_DROP);

  return [
    emptyElement(SVG_TAGS.RECT, {
      x: EXPORT_MARGIN,
      y: coordinateOf(top),
      width: EXPORT_FRAME.WIDTH - EXPORT_MARGIN * 2,
      height: coordinateOf(chartHeight),
      rx: CARD_RADIUS,
      fill: palette.card,
      stroke: palette.line,
    }),
    ...R.map(lines, (line, lineIndex) =>
      emptyElement(SVG_TAGS.CIRCLE, {
        cx: EXPORT_MARGIN + SWATCH_OFFSET + lineIndex * SWATCH_SPACING,
        cy: coordinateOf(top + SWATCH_CENTRE_DROP),
        r: SWATCH_RADIUS,
        fill: line.series.color,
      }),
    ),
    textElement(
      {
        x: EXPORT_MARGIN + CHART_NAME_OFFSET + (lines.length - 1) * SWATCH_SPACING,
        y: headingBaseline,
        'font-size': CHART_NAME_FONT_SIZE,
        'font-weight': BOLD_WEIGHT,
        fill: palette.text,
      },
      chartTitleOf(lines, request.texts.mergedSeparator),
    ),
    summaryOf(lines, headingBaseline, request),
    ...gridOf(plot, frame, axes, request),
    ...bandsOf(bands, plot, frame, request, index === FIRST_CHART),
    ...R.map(lines, (line) => pathOf(line, plot, frame)),
  ];
};
