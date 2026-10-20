import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { formatCalendarDate } from '../../../../shared/utils/date-format/date-format.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { CalendarCell } from '../../models/calendar-grid/calendar-grid';

@Component({
  selector: 'app-month-calendar',
  templateUrl: './month-calendar.component.html',
  styleUrl: './month-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthCalendarComponent {
  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;

  public readonly title = input.required<string>();
  public readonly weekdays = input.required<readonly string[]>();
  public readonly cells = input.required<readonly CalendarCell[]>();
  public readonly hint = input.required<string>();

  public readonly previousRequested = output<void>();
  public readonly nextRequested = output<void>();
  public readonly dayPicked = output<number>();

  protected readonly days = computed(() => this.cells().map((cell) => ({ cell, label: formatCalendarDate(cell.dayStartMilliseconds) })));

  protected pick(cell: CalendarCell): void {
    if (!cell.isOutOfBounds) {
      this.dayPicked.emit(cell.dayStartMilliseconds);
    }
  }
}
