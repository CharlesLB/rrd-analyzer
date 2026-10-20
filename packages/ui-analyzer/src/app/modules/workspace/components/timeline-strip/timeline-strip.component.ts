import { ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { capturePointerOn, horizontalFractionIn, horizontalFractionOf, isPrimaryPress } from '../../../../shared/utils/pointer-fraction/pointer-fraction.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { CanvasOverview } from '../../../../stores/workspace/models/series/series.model';
import { type TimeRange, timestampRangeOf } from '../../../../stores/workspace/models/timeframe/timeframe';
import {
  draggedWindowOf,
  nudgedWindowOf,
  recentredWindowOf,
  STRIP_HANDLES,
  type StripGesture,
  type StripHandle,
  stripTicksOf,
  stripValuePercentOf,
  stripWindowPlacementOf,
} from '../../models/timeline-strip/timeline-strip';
import { TimelineOverviewComponent } from '../timeline-overview/timeline-overview.component';

@Component({
  selector: 'app-timeline-strip',
  imports: [TimelineOverviewComponent],
  templateUrl: './timeline-strip.component.html',
  styleUrl: './timeline-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineStripComponent {
  public readonly bounds = input.required<TimeRange>();
  public readonly window = input.required<TimeRange>();
  public readonly stepMilliseconds = input.required<number>();
  public readonly overview = input.required<CanvasOverview | null>();

  public readonly gestureStarted = output<TimeRange>();
  public readonly windowSlid = output<TimeRange>();

  private readonly _track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly _texts = inject(I18nStore).texts;
  private readonly _gestureState = signal<StripGesture | null>(null);

  private readonly _isNudgingState = signal(false);
  private readonly _windowBeforeGestureState = signal<TimeRange | null>(null);

  public readonly isHeld = computed(() => this._gestureState() !== null);

  protected readonly handles = STRIP_HANDLES;

  protected readonly sliders = computed(() => {
    const texts = this._texts().timeframeBar;
    const window = this.window();
    const bounds = this.bounds();
    const { from, to } = timestampRangeOf(window);

    return {
      body: {
        label: texts.windowPosition,
        text: formatMessage(texts.absoluteRange, { from, to }),
        percent: stripValuePercentOf(window.fromMilliseconds, bounds),
      },
      start: { label: texts.windowStart, text: from, percent: stripValuePercentOf(window.fromMilliseconds, bounds) },
      end: { label: texts.windowEnd, text: to, percent: stripValuePercentOf(window.untilMilliseconds, bounds) },
    };
  });

  protected readonly ticks = computed(() => stripTicksOf(this.bounds(), this._texts().calendar.monthAbbreviations));
  protected readonly placement = computed(() => stripWindowPlacementOf(this.window(), this.bounds()));

  protected recentreAndDrag(event: PointerEvent): void {
    if (event.target !== event.currentTarget || !isPrimaryPress(event)) {
      return;
    }

    this._startGesture(event, STRIP_HANDLES.BODY, recentredWindowOf(this.window(), horizontalFractionOf(event), this.bounds()));
  }

  protected beginDrag(event: PointerEvent, handle: StripHandle): void {
    if (isPrimaryPress(event)) {
      this._startGesture(event, handle, this.window());
    }
  }

  protected continueDrag(event: PointerEvent): void {
    const gesture = this._gestureState();

    if (gesture !== null) {
      this.windowSlid.emit(draggedWindowOf(gesture, horizontalFractionOf(event), this.bounds(), this.stepMilliseconds()));
    }
  }

  protected endDrag(): void {
    this._gestureState.set(null);
  }

  public cancelGesture(): void {
    const windowBefore = this._windowBeforeGestureState();

    if (this._gestureState() !== null && windowBefore !== null) {
      this._gestureState.set(null);
      this.windowSlid.emit(windowBefore);
    }
  }

  protected nudge(event: Event, handle: StripHandle, direction: number): void {
    event.preventDefault();

    if (!this._isNudgingState()) {
      this._isNudgingState.set(true);
      this.gestureStarted.emit(this.window());
    }

    this.windowSlid.emit(nudgedWindowOf(handle, this.window(), direction, this.bounds(), this.stepMilliseconds()));
  }

  protected endNudging(): void {
    this._isNudgingState.set(false);
  }

  private _startGesture(event: PointerEvent, handle: StripHandle, window: TimeRange): void {
    const track = this._track().nativeElement;

    event.preventDefault();
    capturePointerOn(track, event);
    this._windowBeforeGestureState.set(this.window());
    this._gestureState.set({ handle, anchorFraction: horizontalFractionIn(track, event), window });
    this.gestureStarted.emit(window);
  }
}
