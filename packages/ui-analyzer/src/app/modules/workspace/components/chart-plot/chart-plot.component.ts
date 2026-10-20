import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type InsightOverlays, NO_OVERLAYS } from '../../models/insight-overlay/insight-overlay';
import { type LogMark, NO_LOG_MARKS } from '../../models/log-mark/log-mark';
import type { AxisLabelRow, PlotLine } from '../../models/plot-geometry/plot-geometry';
import type { ReferenceLine } from '../../models/reference-line/reference-line';
import { PlotDrawingComponent } from '../plot-drawing/plot-drawing.component';

@Component({
  selector: 'app-chart-plot',
  imports: [PlotDrawingComponent],
  templateUrl: './chart-plot.component.html',
  styleUrl: './chart-plot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartPlotComponent {
  public readonly lines = input.required<readonly PlotLine[]>();
  public readonly axisRows = input.required<readonly AxisLabelRow[]>();
  public readonly referenceLines = input.required<readonly ReferenceLine[]>();
  public readonly referenceColor = input.required<string>();
  public readonly overlays = input<InsightOverlays>(NO_OVERLAYS);
  public readonly logMarks = input<readonly LogMark[]>(NO_LOG_MARKS);
}
