import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { inputValueOf } from '../../../../shared/utils/input-value/input-value.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import {
  ABSOLUTE_FIELDS,
  ABSOLUTE_PROBLEMS,
  type AbsoluteField,
  type AbsoluteProblem,
  absoluteProblemOf,
} from '../../../../stores/time-window/models/absolute-time/absolute-time';
import { type TimeRange, timestampRangeOf } from '../../../../stores/workspace/models/timeframe/timeframe';
import { type AbsoluteDraft, showsWindow, withDayPicked, withFieldFocused, withMonthShown, withTextTyped } from '../../models/absolute-draft/absolute-draft';
import { calendarCells, calendarMonthOf, monthTitleOf, shiftMonth } from '../../models/calendar-grid/calendar-grid';
import { MonthCalendarComponent } from '../month-calendar/month-calendar.component';

const FIELD_OF_PROBLEM: Readonly<Record<AbsoluteProblem, AbsoluteField>> = {
  [ABSOLUTE_PROBLEMS.FROM_FORMAT]: ABSOLUTE_FIELDS.FROM,
  [ABSOLUTE_PROBLEMS.TO_FORMAT]: ABSOLUTE_FIELDS.TO,
  [ABSOLUTE_PROBLEMS.TO_BEFORE_FROM]: ABSOLUTE_FIELDS.TO,
};

const PREVIOUS_MONTH = -1;
const NEXT_MONTH = 1;

@Component({
  selector: 'app-absolute-range',
  imports: [MonthCalendarComponent],
  templateUrl: './absolute-range.component.html',
  styleUrl: './absolute-range.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AbsoluteRangeComponent {
  public readonly draft = model.required<AbsoluteDraft>();
  public readonly window = input.required<TimeRange>();
  public readonly bounds = input.required<TimeRange>();
  public readonly notice = input('');

  public readonly applyRequested = output<void>();
  public readonly closeRequested = output<void>();

  private readonly _hasTriedToApply = signal(false);
  private readonly _problem = computed(() => absoluteProblemOf(this.draft().fromText, this.draft().toText));

  private readonly _shownProblem = computed(() => {
    const problem = this._problem();

    return problem === ABSOLUTE_PROBLEMS.TO_BEFORE_FROM || this._hasTriedToApply() ? problem : null;
  });

  protected readonly texts = inject(I18nStore).texts;
  protected readonly fieldInputs = computed(() => {
    const popover = this.texts().timeframePopover;
    const problem = this._shownProblem();
    const blamed = problem === null ? null : FIELD_OF_PROBLEM[problem];

    return [
      {
        field: ABSOLUTE_FIELDS.FROM,
        label: popover.fromLabel,
        placeholder: popover.fromPlaceholder,
        text: this.draft().fromText,
        isInvalid: blamed === ABSOLUTE_FIELDS.FROM,
      },
      {
        field: ABSOLUTE_FIELDS.TO,
        label: popover.toLabel,
        placeholder: popover.toPlaceholder,
        text: this.draft().toText,
        isInvalid: blamed === ABSOLUTE_FIELDS.TO,
      },
    ];
  });

  protected readonly problemMessage = computed(() => {
    const popover = this.texts().timeframePopover;
    const problem = this._shownProblem();

    const messages: Readonly<Record<AbsoluteProblem, string>> = {
      [ABSOLUTE_PROBLEMS.FROM_FORMAT]: popover.invalidFormat,
      [ABSOLUTE_PROBLEMS.TO_FORMAT]: popover.invalidFormat,
      [ABSOLUTE_PROBLEMS.TO_BEFORE_FROM]: popover.toBeforeFrom,
    };

    return problem === null ? '' : messages[problem];
  });

  protected readonly shownNotice = computed(() => (this._problem() === null && showsWindow(this.draft(), this.window()) ? this.notice() : ''));

  private readonly _monthStart = computed(() => calendarMonthOf(this.draft().calendarMonth, this.draft().fromText, this.window().fromMilliseconds));

  protected readonly monthTitle = computed(() => monthTitleOf(this._monthStart(), this.texts().calendar.monthNames));

  protected readonly cells = computed(() => calendarCells(this._monthStart(), this.draft().fromText, this.draft().toText, this.bounds()));

  protected readonly hint = computed(() => {
    const popover = this.texts().timeframePopover;

    return formatMessage(popover.pickHint, { field: this.draft().focusedField === ABSOLUTE_FIELDS.FROM ? popover.fromLabel : popover.toLabel });
  });

  protected readonly dataBoundsLabel = computed(() => {
    const texts = this.texts();

    return formatMessage(texts.timeframePopover.dataBounds, {
      bounds: formatMessage(texts.timeframeBar.absoluteRange, timestampRangeOf(this.bounds())),
    });
  });

  protected type(field: AbsoluteField, event: Event): void {
    this.draft.update((draft) => withTextTyped(draft, field, inputValueOf(event)));
  }

  protected focus(field: AbsoluteField): void {
    this.draft.update((draft) => withFieldFocused(draft, field));
  }

  protected showPreviousMonth(): void {
    this.draft.update((draft) => withMonthShown(draft, shiftMonth(this._monthStart(), PREVIOUS_MONTH)));
  }

  protected showNextMonth(): void {
    this.draft.update((draft) => withMonthShown(draft, shiftMonth(this._monthStart(), NEXT_MONTH)));
  }

  protected pickDay(dayStartMilliseconds: number): void {
    this.draft.update((draft) => withDayPicked(draft, dayStartMilliseconds));
  }

  protected apply(): void {
    this._hasTriedToApply.set(true);

    if (this._problem() === null) {
      this.applyRequested.emit();
    }
  }
}
