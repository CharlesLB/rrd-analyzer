import { formatMessage } from '@rrd-analyzer/shared';
import { formatDuration, formatFullTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import { TEXT_ANCHORS, textElement } from '../../../../shared/utils/svg-markup/svg-markup.util';
import { chartTitleOf } from '../../../workspace/models/series/series.model';
import { spanOf } from '../../../workspace/models/timeframe/timeframe';
import { BOLD_WEIGHT, EXPORT_FRAME, EXPORT_MARGIN } from '../export-layout/export-layout';
import type { ExportDocumentRequest } from '../export-request/export-request';

const TITLE_BASELINE = 52;
const RANGE_BASELINE = 84;
const TITLE_FONT_SIZE = 27;
const RANGE_FONT_SIZE = 16;
const BRAND_FONT_SIZE = 16;
const ONE_CHART = 1;

export const headerOf = (request: ExportDocumentRequest): readonly string[] => {
  const { charts, palette, texts, window: visibleWindow } = request;
  const [onlyChart] = charts;
  const isSingleChart = charts.length === ONE_CHART && onlyChart !== undefined;

  const range = formatMessage(texts.document.range, {
    from: formatFullTimestamp(visibleWindow.fromMilliseconds),
    to: formatFullTimestamp(visibleWindow.untilMilliseconds),
    duration: formatDuration(spanOf(visibleWindow), texts.units),
    context: isSingleChart ? request.analysisName : formatMessage(texts.document.chartCount, { count: charts.length }),
  });

  return [
    textElement(
      { x: EXPORT_MARGIN, y: TITLE_BASELINE, 'font-size': TITLE_FONT_SIZE, 'font-weight': BOLD_WEIGHT, fill: palette.text },
      isSingleChart ? chartTitleOf(onlyChart.lines, texts.mergedSeparator) : request.analysisName,
    ),
    textElement({ x: EXPORT_MARGIN, y: RANGE_BASELINE, 'font-size': RANGE_FONT_SIZE, fill: palette.muted }, range),
    textElement(
      {
        x: EXPORT_FRAME.WIDTH - EXPORT_MARGIN,
        y: TITLE_BASELINE,
        'text-anchor': TEXT_ANCHORS.END,
        'font-size': BRAND_FONT_SIZE,
        'font-weight': BOLD_WEIGHT,
        fill: palette.accent,
      },
      texts.brand,
    ),
  ];
};
