import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CalendarIconComponent } from '../../../../shared/components/icons/calendar-icon/calendar-icon.component';
import { offsetRightOf } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { DayShift } from '../../../../stores/workspace/models/day-shift/day-shift';
import type { ShiftDirection } from '../../../../stores/workspace/models/timeframe/timeframe';
import { TimeNavArrowComponent } from '../time-nav-arrow/time-nav-arrow.component';

@Component({
  selector: 'app-time-nav',
  imports: [CalendarIconComponent, TimeNavArrowComponent],
  templateUrl: './time-nav.component.html',
  styleUrl: './time-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeNavComponent {
  public readonly backShift = input.required<DayShift>();
  public readonly forwardShift = input.required<DayShift>();
  public readonly timeframeLabel = input.required<string>();
  public readonly durationAndStep = input.required<string>();
  public readonly isTimeframeOpen = input.required<boolean>();
  public readonly isCompact = input.required<boolean>();

  public readonly shiftRequested = output<ShiftDirection>();
  public readonly datesToggled = output<number>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly offsetRight = offsetRightOf;
}
