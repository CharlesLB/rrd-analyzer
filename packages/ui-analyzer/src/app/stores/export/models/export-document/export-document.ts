import * as R from 'remeda';
import { emptyElement, SVG_TAGS, styleDefinitionsOf, svgDocumentOf } from '../../../../shared/utils/svg-markup/svg-markup.util';
import { valueAxesOf } from '../../../workspace/models/value-axis/value-axis';
import { shadedBandsOf } from '../export-band/export-band';
import { chartCardOf } from '../export-chart-card/export-chart-card';
import { footerOf } from '../export-footer/export-footer';
import { headerOf } from '../export-header/export-header';
import { EXPORT_FRAME, FONT_STACK, plotFrameOf } from '../export-layout/export-layout';
import type { ExportChart, ExportDocumentRequest } from '../export-request/export-request';
import { timeAxisOf } from '../export-time-axis/export-time-axis';

export type ExportDocument = {
  readonly markup: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly shadedFindingCount: number;
};

const embeddedFontOf = (fontFace: string): readonly string[] => (fontFace === '' ? [] : [styleDefinitionsOf(fontFace)]);

const axisColumnCountOf = (charts: readonly ExportChart[]): number => Math.max(1, ...R.map(charts, (chart) => valueAxesOf(chart.lines).length));

export const exportDocumentOf = (request: ExportDocumentRequest): ExportDocument => {
  const bands = shadedBandsOf(request.findings, request.window);
  const frame = { width: EXPORT_FRAME.WIDTH, height: EXPORT_FRAME.HEIGHT };
  const plotFrame = plotFrameOf(axisColumnCountOf(request.charts));

  const markup = svgDocumentOf({ ...frame, viewBox: `0 0 ${EXPORT_FRAME.WIDTH} ${EXPORT_FRAME.HEIGHT}`, 'font-family': FONT_STACK }, [
    ...embeddedFontOf(request.embeddedFontFace),
    emptyElement(SVG_TAGS.RECT, { ...frame, fill: request.palette.background }),
    ...headerOf(request),
    ...R.flatMap(request.charts, (chart, index) => chartCardOf(chart, index, bands, request, plotFrame)),
    ...timeAxisOf(request, plotFrame),
    footerOf(request, bands.length),
  ]);

  return { markup, ...frame, background: request.palette.background, shadedFindingCount: bands.length };
};
