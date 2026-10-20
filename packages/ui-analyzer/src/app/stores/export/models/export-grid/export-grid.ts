import * as R from 'remeda';
import { valueAtFraction } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { emptyElement, SVG_TAGS, TEXT_ANCHORS, textElement } from '../../../../shared/utils/svg-markup/svg-markup.util';
import { coordinateOf } from '../../../../shared/utils/svg-path/svg-path.util';
import { formatValue } from '../../../../shared/utils/value-format/value-format.util';
import type { ValueAxis } from '../../../workspace/models/value-axis/value-axis';
import { AXIS_COLUMN_WIDTH, type PlotArea, type PlotFrame } from '../export-layout/export-layout';
import type { ExportDocumentRequest } from '../export-request/export-request';

const GRID_DIVISIONS = 3;
const GRID_STROKE_WIDTH = 1.2;
const GRID_LABEL_GAP = 14;
const GRID_LABEL_BASELINE_DROP = 5;
const GRID_LABEL_FONT_SIZE = 14;
const ONE_AXIS = 1;

const axisLabelXOf = (column: number, frame: PlotFrame): number => frame.left - GRID_LABEL_GAP - column * AXIS_COLUMN_WIDTH;

const axisLabelsAt = (y: number, division: number, axes: readonly ValueAxis[], frame: PlotFrame, request: ExportDocumentRequest): readonly string[] =>
  R.map(axes, (axis, column) =>
    textElement(
      {
        x: axisLabelXOf(column, frame),
        y: coordinateOf(y + GRID_LABEL_BASELINE_DROP),
        'text-anchor': TEXT_ANCHORS.END,
        'font-size': GRID_LABEL_FONT_SIZE,
        fill: axes.length > ONE_AXIS ? axis.color : request.palette.muted,
      },
      formatValue(valueAtFraction(axis.range, 1 - division / GRID_DIVISIONS), axis.unit, request.texts.units),
    ),
  );

export const gridOf = (plot: PlotArea, frame: PlotFrame, axes: readonly ValueAxis[], request: ExportDocumentRequest): readonly string[] =>
  R.flatMap(R.range(0, GRID_DIVISIONS + 1), (division) => {
    const y = plot.top + (plot.height * division) / GRID_DIVISIONS;

    return [
      emptyElement(SVG_TAGS.LINE, {
        x1: frame.left,
        x2: frame.left + frame.width,
        y1: coordinateOf(y),
        y2: coordinateOf(y),
        stroke: request.palette.grid,
        'stroke-width': GRID_STROKE_WIDTH,
      }),
      ...axisLabelsAt(y, division, axes, frame, request),
    ];
  });
