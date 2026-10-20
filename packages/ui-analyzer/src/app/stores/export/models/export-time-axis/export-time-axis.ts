import { formatShortTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import { TEXT_ANCHORS, textElement } from '../../../../shared/utils/svg-markup/svg-markup.util';
import { coordinateOf, evenlySpacedPositionOf } from '../../../../shared/utils/svg-path/svg-path.util';
import { timeTickInstantsOf } from '../../../workspace/models/time-axis/time-axis';
import { type PlotFrame, timeAxisTopOf } from '../export-layout/export-layout';
import type { ExportDocumentRequest } from '../export-request/export-request';

const AXIS_BASELINE_DROP = 27;
const AXIS_FONT_SIZE = 14;

const tickAnchorOf = (index: number, lastIndex: number): string => {
  if (index === 0) {
    return TEXT_ANCHORS.START;
  }

  return index === lastIndex ? TEXT_ANCHORS.END : TEXT_ANCHORS.MIDDLE;
};

export const timeAxisOf = (request: ExportDocumentRequest, frame: PlotFrame): readonly string[] => {
  const baseline = timeAxisTopOf(request.charts.length) + AXIS_BASELINE_DROP;
  const instants = timeTickInstantsOf(request.window);
  const lastIndex = instants.length - 1;

  return instants.map((instant, index) =>
    textElement(
      {
        x: coordinateOf(frame.left + evenlySpacedPositionOf(index, instants.length, frame.width)),
        y: coordinateOf(baseline),
        'text-anchor': tickAnchorOf(index, lastIndex),
        'font-size': AXIS_FONT_SIZE,
        fill: request.palette.muted,
      },
      formatShortTimestamp(instant),
    ),
  );
};
