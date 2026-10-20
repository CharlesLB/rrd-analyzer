import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { InsightOverlays } from '../../models/insight-overlay/insight-overlay';
import { type LogMark, NO_LOG_MARKS } from '../../models/log-mark/log-mark';
import { HORIZONTAL_GRID_LINES, PLOT_HEIGHT, PLOT_VIEW_BOX, PLOT_WIDTH, type PlotLine, VERTICAL_GRID_LINES } from '../../models/plot-geometry/plot-geometry';
import type { ReferenceLine } from '../../models/reference-line/reference-line';

@Component({
  selector: 'app-plot-drawing',
  templateUrl: './plot-drawing.component.html',
  styleUrl: './plot-drawing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlotDrawingComponent {
  public readonly lines = input.required<readonly PlotLine[]>();
  public readonly referenceLines = input.required<readonly ReferenceLine[]>();
  public readonly referenceColor = input.required<string>();
  public readonly overlays = input.required<InsightOverlays>();
  public readonly logMarks = input<readonly LogMark[]>(NO_LOG_MARKS);

  protected readonly viewBox = PLOT_VIEW_BOX;
  protected readonly plotWidth = PLOT_WIDTH;
  protected readonly plotHeight = PLOT_HEIGHT;
  protected readonly horizontalGridLines = HORIZONTAL_GRID_LINES;
  protected readonly verticalGridLines = VERTICAL_GRID_LINES;
}
