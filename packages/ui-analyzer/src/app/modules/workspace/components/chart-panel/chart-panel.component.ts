import { ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { PopoverAnchor } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { DRAG_EFFECTS, hasLeftTarget, startDragTransfer } from '../../../../shared/utils/drag-transfer/drag-transfer.util';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import { capturePointer, horizontalFractionOf, isPrimaryPress, verticalFractionOf } from '../../../../shared/utils/pointer-fraction/pointer-fraction.util';
import { unitLabelOf } from '../../../../shared/utils/value-format/value-format.util';
import type { ExportMenuRequest } from '../../../../stores/export/models/export-menu/export-menu';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { DropPosition } from '../../../../stores/workspace/models/canvas-operations/canvas-operations';
import type { ColorMenuRequest } from '../../../../stores/workspace/models/color-menu/color-menu';
import { type CanvasChart, chartTitleOf, haveSameLines } from '../../../../stores/workspace/models/series/series.model';
import type { SeriesMenuRequest } from '../../../../stores/workspace/models/series-menu/series-menu';
import type { StatisticKey } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { type ChartCursor, type SelectionDraft, selectionExtentOf, type TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';
import { rangedLinesOf, valueAxesOf } from '../../../../stores/workspace/models/value-axis/value-axis';
import { type CursorReading, crosshairReadingsOf, legendEntriesOf, lineReadingsOf, type ReadingTexts } from '../../models/chart-reading/chart-reading';
import { type ChartResizeGesture, nudgedHeightOf, resizedHeightOf, startedResize } from '../../models/chart-resize/chart-resize';
import { headerStatisticsOf } from '../../models/chart-statistics/chart-statistics';
import { type InsightOverlays, NO_OVERLAYS } from '../../models/insight-overlay/insight-overlay';
import { type LogMark, NO_LOG_MARKS } from '../../models/log-mark/log-mark';
import { axisLabelRowsOf, columnFractionOf, plotPathOf, TICK_ALIGNMENTS, timeTicksOf } from '../../models/plot-geometry/plot-geometry';
import { referenceLinesOf } from '../../models/reference-line/reference-line';
import { ChartCrosshairComponent } from '../chart-crosshair/chart-crosshair.component';
import { ChartDropIndicatorComponent } from '../chart-drop-indicator/chart-drop-indicator.component';
import { ChartLegendComponent } from '../chart-legend/chart-legend.component';
import { ChartPanelHeaderComponent } from '../chart-panel-header/chart-panel-header.component';
import { ChartPlotComponent } from '../chart-plot/chart-plot.component';

export type DropTargetUpdate = {
  readonly chartId: string;
  readonly verticalFraction: number;
};

export type ChartHeightUpdate = {
  readonly chartId: string;
  readonly height: number;
};

@Component({
  selector: 'app-chart-panel',
  imports: [ChartCrosshairComponent, ChartDropIndicatorComponent, ChartLegendComponent, ChartPanelHeaderComponent, ChartPlotComponent],
  templateUrl: './chart-panel.component.html',
  styleUrl: './chart-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartPanelComponent {
  public readonly chart = input.required<CanvasChart>();
  public readonly window = input.required<TimeRange>();
  public readonly cursor = input.required<ChartCursor | null>();
  public readonly selection = input.required<SelectionDraft | null>();
  public readonly isCursorSynchronized = input.required<boolean>();
  public readonly isDragging = input.required<boolean>();
  public readonly dropPosition = input.required<DropPosition | null>();
  public readonly overlays = input<InsightOverlays>(NO_OVERLAYS);
  public readonly logMarks = input<readonly LogMark[]>(NO_LOG_MARKS);
  public readonly isExportMenuOpen = input(false);
  public readonly isSeriesMenuOpen = input(false);
  public readonly pickingSeriesId = input<string | null>(null);
  public readonly height = input<number | null>(null);
  public readonly cursorTime = input('');

  public readonly removeRequested = output<string>();
  public readonly exportMenuRequested = output<ExportMenuRequest>();
  public readonly seriesMenuRequested = output<SeriesMenuRequest>();
  public readonly referenceLineToggled = output<StatisticKey>();
  public readonly pointerMoved = output<number>();
  public readonly pointerEntered = output<string>();
  public readonly pointerLeft = output<void>();
  public readonly selectionStarted = output<number>();
  public readonly selectionFinished = output<void>();
  public readonly selectionCancelled = output<void>();
  public readonly zoomBackRequested = output<void>();
  public readonly dragStarted = output<string>();
  public readonly dragEnded = output<void>();
  public readonly dropTargetChanged = output<DropTargetUpdate>();
  public readonly dropTargetLeft = output<string>();
  public readonly dropped = output<string>();
  public readonly resized = output<ChartHeightUpdate>();
  public readonly resizeCleared = output<string>();
  public readonly colorMenuRequested = output<ColorMenuRequest>();

  private readonly _panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly _texts = inject(I18nStore).texts;
  private readonly _resizeState = signal<ChartResizeGesture | null>(null);

  public readonly isResizing = computed(() => this._resizeState() !== null);

  protected readonly resizeTip = computed(() => this._texts().canvas.resizeChart);

  private readonly _chartLines = computed(() => this.chart().lines, { equal: haveSameLines });
  private readonly _axes = computed(() => valueAxesOf(this._chartLines()));
  private readonly _lines = computed(() => rangedLinesOf(this._chartLines(), this._axes()));

  private readonly _readingTexts = computed<ReadingTexts>(() => ({ canvas: this._texts().canvas, units: this._texts().units }));

  protected readonly isMerged = computed(() => this._lines().length > 1);
  protected readonly swatches = computed(() =>
    R.map(this._lines(), (line) => ({
      seriesId: line.series.id,
      color: line.series.color,
      label: formatMessage(this._texts().canvas.changeColor, { name: line.series.name }),
      isPicking: line.series.id === this.pickingSeriesId(),
    })),
  );
  protected readonly seriesButtonLabel = computed(() => formatMessage(this._texts().seriesMenu.buttonLabel, { count: this._lines().length }));
  protected readonly title = computed(() => chartTitleOf(this._lines(), this._texts().application.mergedSeparator));

  protected readonly unitLabel = computed(() =>
    R.pipe(
      this._axes(),
      R.map((axis) => unitLabelOf(axis.unit, this._texts().units)),
      R.unique(),
      R.join(this._texts().application.listSeparator),
    ),
  );

  protected readonly plotLines = computed(() =>
    R.map(this._lines(), (line) => ({ seriesId: line.series.id, color: line.series.color, path: plotPathOf(line.samples, line.range) })),
  );

  protected readonly axisRows = computed(() => axisLabelRowsOf(this._axes(), this._texts().units));
  protected readonly ticks = computed(() => timeTicksOf(this.window()));
  protected readonly tickAlignments = TICK_ALIGNMENTS;

  private readonly _shownCursorFraction = computed(() => {
    const cursor = this.cursor();

    return cursor !== null && (this.isCursorSynchronized() || cursor.chartId === this.chart().id) ? cursor.fraction : null;
  });

  protected readonly cursorReading = computed<CursorReading | null>(() => {
    const fraction = this._shownCursorFraction();

    return fraction === null ? null : { fraction, time: this.cursorTime() };
  });

  private readonly _readings = computed(() => lineReadingsOf(this._lines(), this.cursorReading()));

  protected readonly crosshairReadings = computed(() => crosshairReadingsOf(this._readings(), this.cursorReading(), this._readingTexts()));
  protected readonly legend = computed(() => legendEntriesOf(this._readings(), this.cursorReading(), this._readingTexts()));
  private readonly _leadLine = computed(() => R.first(this._lines()));
  private readonly _sampleCount = computed(() => this._leadLine()?.samples.length ?? 0);

  protected readonly statistics = computed(() => {
    const lead = this._leadLine();
    const texts = this._texts();

    return headerStatisticsOf(lead?.statistics ?? null, lead?.series.unit ?? '', this.chart().referenceLines, texts.statistics, texts.units);
  });

  protected readonly referenceColor = computed(() => this._leadLine()?.series.color ?? '');

  protected readonly referenceLines = computed(() => {
    const lead = this._leadLine();
    const texts = this._texts();

    return lead === undefined || this.isMerged()
      ? []
      : referenceLinesOf(this.chart().referenceLines, lead.statistics, lead.range, texts.statistics, texts.units);
  });

  protected readonly selectionBand = computed(() => {
    const selection = this.selection();

    if (selection === null) {
      return null;
    }

    const { start, end } = selectionExtentOf(selection);

    return { left: percentOf(start), width: percentOf(end - start) };
  });

  protected requestExportMenu(anchor: PopoverAnchor): void {
    this.exportMenuRequested.emit({ chartId: this.chart().id, ...anchor });
  }

  protected requestSeriesMenu(anchor: PopoverAnchor): void {
    this.seriesMenuRequested.emit({ chartId: this.chart().id, ...anchor });
  }

  protected startDrag(event: DragEvent): void {
    startDragTransfer(event, this.chart().id, DRAG_EFFECTS.MOVE);
    this.dragStarted.emit(this.chart().id);
  }

  protected trackDropTarget(event: DragEvent): void {
    if (!this.isDragging()) {
      return;
    }

    event.preventDefault();
    this.dropTargetChanged.emit({ chartId: this.chart().id, verticalFraction: verticalFractionOf(event) });
  }

  protected leaveDropTarget(event: DragEvent): void {
    if (this.isDragging() && hasLeftTarget(event)) {
      this.dropTargetLeft.emit(this.chart().id);
    }
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dropped.emit(this.chart().id);
  }

  protected startSelection(event: PointerEvent): void {
    if (!isPrimaryPress(event)) {
      return;
    }

    capturePointer(event);
    this.selectionStarted.emit(horizontalFractionOf(event));
  }

  protected movePointer(event: PointerEvent): void {
    this.pointerMoved.emit(columnFractionOf(horizontalFractionOf(event), this._sampleCount()));
  }

  protected startResize(event: PointerEvent): void {
    if (!isPrimaryPress(event)) {
      return;
    }

    capturePointer(event);
    this._resizeState.set(startedResize(event.clientY, this._panel().nativeElement.getBoundingClientRect().height, this.height()));
  }

  protected continueResize(event: PointerEvent): void {
    const gesture = this._resizeState();

    if (gesture !== null) {
      this.resized.emit({ chartId: this.chart().id, height: resizedHeightOf(gesture, event.clientY) });
    }
  }

  protected endResize(): void {
    this._resizeState.set(null);
  }

  public cancelResize(): void {
    const gesture = this._resizeState();

    if (gesture === null) {
      return;
    }

    this._resizeState.set(null);

    if (gesture.heightBefore === null) {
      this.resizeCleared.emit(this.chart().id);

      return;
    }

    this.resized.emit({ chartId: this.chart().id, height: gesture.heightBefore });
  }

  protected nudgeHeight(event: Event, direction: number): void {
    event.preventDefault();
    this.resized.emit({ chartId: this.chart().id, height: nudgedHeightOf(this._panel().nativeElement.getBoundingClientRect().height, direction) });
  }
}
