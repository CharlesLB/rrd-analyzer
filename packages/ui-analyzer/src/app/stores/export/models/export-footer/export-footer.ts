import { formatMessage, formatPlural } from '@rrd-analyzer/shared';
import { formatFullTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import { textElement } from '../../../../shared/utils/svg-markup/svg-markup.util';
import { EXPORT_FRAME, EXPORT_MARGIN } from '../export-layout/export-layout';
import { EXPORT_COLUMNS, type ExportDocumentRequest } from '../export-request/export-request';

const FOOTER_BASELINE_RISE = 16;
const FOOTER_FONT_SIZE = 13;

export const footerOf = (request: ExportDocumentRequest, shadedFindingCount: number): string => {
  const messages = request.texts.document;

  const notes = [
    ...(shadedFindingCount > 0 ? [formatPlural(messages.findingsShaded, shadedFindingCount)] : []),
    formatMessage(messages.samplesPerSeries, { count: EXPORT_COLUMNS }),
    formatMessage(messages.exportedAt, { time: formatFullTimestamp(request.exportedAtMilliseconds) }),
  ];

  return textElement(
    { x: EXPORT_MARGIN, y: EXPORT_FRAME.HEIGHT - FOOTER_BASELINE_RISE, 'font-size': FOOTER_FONT_SIZE, fill: request.palette.muted },
    notes.join(messages.noteSeparator),
  );
};
