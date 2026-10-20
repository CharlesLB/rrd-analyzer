import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CHEVRON_DIRECTIONS, type ChevronDirection, ChevronIconComponent } from '../../../../shared/components/icons/chevron-icon/chevron-icon.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { DayShift } from '../../../../stores/workspace/models/day-shift/day-shift';
import { SHIFT_DIRECTIONS, type ShiftDirection } from '../../../../stores/workspace/models/timeframe/timeframe';

const CHEVRON_DIRECTION_OF_SHIFT: Readonly<Record<ShiftDirection, ChevronDirection>> = {
  [SHIFT_DIRECTIONS.BACKWARD]: CHEVRON_DIRECTIONS.LEFT,
  [SHIFT_DIRECTIONS.FORWARD]: CHEVRON_DIRECTIONS.RIGHT,
};

const SIDE_CLASSES: Readonly<Record<ShiftDirection, string>> = {
  [SHIFT_DIRECTIONS.BACKWARD]: 'time-nav-arrow-backward',
  [SHIFT_DIRECTIONS.FORWARD]: 'time-nav-arrow-forward',
};

@Component({
  selector: 'app-time-nav-arrow',
  imports: [ChevronIconComponent],
  templateUrl: './time-nav-arrow.component.html',
  styleUrl: './time-nav-arrow.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeNavArrowComponent {
  public readonly shift = input.required<DayShift>();

  public readonly shiftRequested = output<ShiftDirection>();

  private readonly _texts = inject(I18nStore).texts;

  protected readonly isHovered = signal(false);
  protected readonly chevronDirection = computed(() => CHEVRON_DIRECTION_OF_SHIFT[this.shift().direction]);
  protected readonly sideClass = computed(() => SIDE_CLASSES[this.shift().direction]);

  protected readonly actionLabel = computed(() => {
    const texts = this._texts().timeNav;

    const labels: Readonly<Record<ShiftDirection, string>> = {
      [SHIFT_DIRECTIONS.BACKWARD]: texts.shiftBack,
      [SHIFT_DIRECTIONS.FORWARD]: texts.shiftForward,
    };

    return labels[this.shift().direction];
  });

  protected showTooltip(): void {
    this.isHovered.set(true);
  }

  protected hideTooltip(): void {
    this.isHovered.set(false);
  }

  protected requestShift(): void {
    if (!this.shift().isAvailable) {
      return;
    }

    this.shiftRequested.emit(this.shift().direction);
  }
}
