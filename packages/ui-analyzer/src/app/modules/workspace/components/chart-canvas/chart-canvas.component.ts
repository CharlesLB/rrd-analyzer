import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { hasLeftTarget } from '../../../../shared/utils/drag-transfer/drag-transfer.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { type ChartHeight, canvasGridOf, leavesRoomBelowTheCharts } from '../../models/canvas-layout/canvas-layout';

const EMPTY_CANVAS_SELECTOR = '.chart-canvas-empty';

@Component({
  selector: 'app-chart-canvas',
  templateUrl: './chart-canvas.component.html',
  styleUrl: './chart-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartCanvasComponent {
  public readonly chartHeights = input.required<readonly ChartHeight[]>();
  public readonly isCompact = input.required<boolean>();
  public readonly isDragging = input.required<boolean>();

  public readonly backgroundDropped = output<void>();

  private readonly _isBackgroundAimedState = linkedSignal({ source: this.isDragging, computation: () => false });

  protected readonly texts = inject(I18nStore).texts;
  protected readonly hasNoChart = computed(() => this.chartHeights().length === 0);
  protected readonly grid = computed(() => canvasGridOf(this.chartHeights(), this.isCompact()));
  protected readonly isBackgroundAimed = this._isBackgroundAimedState.asReadonly();

  protected aimAtBackground(event: DragEvent): void {
    const isOnBackground = this.isDragging() && this._isOnBackground(event);

    this._isBackgroundAimedState.set(isOnBackground);

    if (isOnBackground) {
      event.preventDefault();
    }
  }

  protected leaveBackground(event: DragEvent): void {
    if (hasLeftTarget(event)) {
      this._isBackgroundAimedState.set(false);
    }
  }

  protected dropOnBackground(event: DragEvent): void {
    this._isBackgroundAimedState.set(false);

    if (this._isOnBackground(event)) {
      event.preventDefault();
      this.backgroundDropped.emit();
    }
  }

  private _isOnBackground(event: DragEvent): boolean {
    if (event.target instanceof Element && event.target.closest(EMPTY_CANVAS_SELECTOR) !== null) {
      return true;
    }

    return event.target === event.currentTarget && leavesRoomBelowTheCharts(this.chartHeights());
  }
}
