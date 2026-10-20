import { computed, inject, Service, signal } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { formatDuration } from '../../../../shared/utils/date-format/date-format.util';
import { useSettlingSignal } from '../../../../shared/utils/settling-signal/settling-signal.util';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { type DayShift, dayShiftOf } from '../../../workspace/models/day-shift/day-shift';
import {
  CHART_COLUMNS,
  type ChartCursor,
  clampWindow,
  DEFAULT_WINDOW_MILLISECONDS,
  instantAt,
  matchingPreset,
  QUICK_UNIT_MILLISECONDS,
  type QuickUnit,
  type SelectionDraft,
  SHIFT_DIRECTIONS,
  type ShiftDirection,
  selectionExtentOf,
  spanOf,
  type TimeRange,
  timestampRangeOf,
  trailingWindow,
  UNKNOWN_STEP_MILLISECONDS,
} from '../../../workspace/models/timeframe/timeframe';
import { ABSOLUTE_OUTCOMES, type AbsoluteOutcome, absoluteProblemOf, parseAbsoluteTimestamp } from '../../models/absolute-time/absolute-time';
import { quickCountOf } from '../../models/quick-count/quick-count';

const EMPTY_RANGE: TimeRange = { fromMilliseconds: 0, untilMilliseconds: 0 };
const SELECTION_ZOOM_THRESHOLD = 0.012;
const SLIDE_SETTLE_MILLISECONDS = 150;
const ZOOM_HISTORY_LIMIT = 100;

@Service({ autoProvided: false })
export class TimeWindowStore {
  private readonly _texts = inject(I18nStore).texts;

  private readonly _boundsState = signal<TimeRange>(EMPTY_RANGE);
  private readonly _stepState = signal(UNKNOWN_STEP_MILLISECONDS);
  private readonly _windowState = signal<TimeRange>(EMPTY_RANGE);
  private readonly _zoomStackState = signal<readonly TimeRange[]>([]);
  private readonly _cursorState = signal<ChartCursor | null>(null);
  private readonly _selectionState = signal<SelectionDraft | null>(null);
  private readonly _queriedWindow = useSettlingSignal<TimeRange>(EMPTY_RANGE, SLIDE_SETTLE_MILLISECONDS);

  private readonly _zoomHistory = computed(() => R.dropLastWhile(this._zoomStackState(), (entry) => R.isDeepEqual(entry, this._windowState())));

  private readonly _dayShifts = computed<Readonly<Record<ShiftDirection, DayShift>>>(() => {
    const texts = this._texts().timeNav;
    const window = this._windowState();
    const bounds = this._boundsState();

    return {
      [SHIFT_DIRECTIONS.BACKWARD]: dayShiftOf(window, SHIFT_DIRECTIONS.BACKWARD, bounds, texts),
      [SHIFT_DIRECTIONS.FORWARD]: dayShiftOf(window, SHIFT_DIRECTIONS.FORWARD, bounds, texts),
    };
  });

  public readonly bounds = this._boundsState.asReadonly();
  public readonly step = this._stepState.asReadonly();
  public readonly window = this._windowState.asReadonly();
  public readonly queriedWindow = this._queriedWindow.value;
  public readonly cursor = this._cursorState.asReadonly();
  public readonly selection = this._selectionState.asReadonly();
  public readonly span = computed(() => spanOf(this._windowState()));
  public readonly hasWindow = computed(() => spanOf(this._boundsState()) > 0);
  public readonly openedWindow = computed(() => (this.hasWindow() ? this._windowState() : null));
  public readonly hasZoomHistory = computed(() => this._zoomHistory().length > 0);
  public readonly activePreset = computed(() => matchingPreset(this._windowState(), this._boundsState().untilMilliseconds, this._stepState()));
  public readonly backShift = computed(() => this._dayShifts()[SHIFT_DIRECTIONS.BACKWARD]);
  public readonly forwardShift = computed(() => this._dayShifts()[SHIFT_DIRECTIONS.FORWARD]);

  public readonly timeframeLabel = computed(() => {
    const texts = this._texts();
    const preset = this.activePreset();

    if (!this.hasWindow()) {
      return '';
    }

    return preset === undefined ? this.rangeLabel() : texts.timeframePopover.presets[preset.key];
  });

  public readonly rangeLabel = computed(() => formatMessage(this._texts().timeframeBar.absoluteRange, timestampRangeOf(this._windowState())));

  public readonly durationLabel = computed(() => formatDuration(this.span(), this._texts().units));

  public readonly durationAndStep = computed(() => {
    const texts = this._texts();

    if (!this.hasWindow()) {
      return '';
    }

    return formatMessage(texts.timeframeBar.durationAndStep, {
      duration: this.durationLabel(),
      step: formatDuration(this.span() / CHART_COLUMNS, texts.units),
    });
  });

  public clear(): void {
    this.initialize(EMPTY_RANGE, UNKNOWN_STEP_MILLISECONDS);
  }

  public initialize(bounds: TimeRange, stepMilliseconds: number): void {
    this._boundsState.set(bounds);
    this._stepState.set(stepMilliseconds);
    this._zoomStackState.set([]);
    this._showWindow(clampWindow(trailingWindow(bounds.untilMilliseconds, DEFAULT_WINDOW_MILLISECONDS), bounds));
    this._clearPointer();
  }

  public setWindow(requested: TimeRange): void {
    const current = this._windowState();

    this._zoomStackState.update((stack) => (R.isDeepEqual(R.last(stack), current) ? stack : R.takeLast([...stack, current], ZOOM_HISTORY_LIMIT)));
    this._showWindow(clampWindow(requested, this._boundsState()));
    this._clearPointer();
  }

  public slideWindow(requested: TimeRange): void {
    const next = clampWindow(requested, this._boundsState());

    this._windowState.set(next);
    this._queriedWindow.settle(next);
  }

  public showTrailing(milliseconds: number): void {
    this.setWindow(trailingWindow(this._boundsState().untilMilliseconds, milliseconds));
  }

  public showTrailingCount(countText: string, unit: QuickUnit): boolean {
    const count = quickCountOf(countText);

    if (count === null) {
      return false;
    }

    this.showTrailing(count * QUICK_UNIT_MILLISECONDS[unit]);

    return true;
  }

  public showAbsolute(fromText: string, toText: string): AbsoluteOutcome {
    const fromMilliseconds = parseAbsoluteTimestamp(fromText);
    const untilMilliseconds = parseAbsoluteTimestamp(toText);

    if (fromMilliseconds === null || untilMilliseconds === null || absoluteProblemOf(fromText, toText) !== null) {
      return ABSOLUTE_OUTCOMES.REFUSED;
    }

    const requested: TimeRange = { fromMilliseconds, untilMilliseconds };

    this.setWindow(requested);

    return R.isDeepEqual(this._windowState(), requested) ? ABSOLUTE_OUTCOMES.APPLIED : ABSOLUTE_OUTCOMES.ADJUSTED;
  }

  public shiftDay(direction: ShiftDirection): void {
    const shift = this._dayShifts()[direction];

    if (shift.isAvailable) {
      this.setWindow(shift.window);
    }
  }

  public zoomBack(): void {
    const history = this._zoomHistory();

    this._showWindow(R.last(history) ?? this._boundsState());
    this._zoomStackState.set(R.dropLast(history, 1));
    this._selectionState.set(null);
  }

  public pointAt(fraction: number, chartId: string | null): void {
    this._cursorState.update((cursor) => (cursor?.fraction === fraction && cursor.chartId === chartId ? cursor : { fraction, chartId }));
    this._selectionState.update((selection) =>
      selection === null || selection.focusFraction === fraction ? selection : { anchorFraction: selection.anchorFraction, focusFraction: fraction },
    );
  }

  public enterChart(chartId: string, isSynchronized: boolean): void {
    if (!isSynchronized) {
      this._cursorState.update((cursor) => ({ chartId, fraction: cursor?.fraction ?? 0 }));
    }
  }

  public beginSelection(fraction: number): void {
    this._selectionState.set({ anchorFraction: fraction, focusFraction: fraction });
  }

  public finishSelection(): void {
    const selection = this._selectionState();

    if (selection === null || Math.abs(selection.focusFraction - selection.anchorFraction) <= SELECTION_ZOOM_THRESHOLD) {
      this._selectionState.set(null);

      return;
    }

    const { start, end } = selectionExtentOf(selection);

    this.setWindow({ fromMilliseconds: this._instantAt(start), untilMilliseconds: this._instantAt(end) });
  }

  public cancelSelection(): void {
    this._selectionState.set(null);
  }

  public leavePlot(): void {
    this._clearPointer();
  }

  private _instantAt(fraction: number): number {
    return instantAt(this._windowState(), fraction);
  }

  private _showWindow(window: TimeRange): void {
    this._windowState.set(window);
    this._queriedWindow.set(window);
  }

  private _clearPointer(): void {
    this._cursorState.set(null);
    this._selectionState.set(null);
  }
}
