import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { TIMEFRAME_TABS, type TimeframeTab } from '../../../../stores/workspace/models/timeframe/timeframe';
import { FocusScopeDirective } from '../../directives/focus-scope/focus-scope.directive';

@Component({
  selector: 'app-timeframe-popover',
  imports: [FocusScopeDirective],
  templateUrl: './timeframe-popover.component.html',
  styleUrl: './timeframe-popover.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeframePopoverComponent {
  public readonly tab = model.required<TimeframeTab>();
  public readonly leftOffset = input.required<number>();
  public readonly isCompact = input.required<boolean>();

  public readonly closeRequested = output<void>();

  private readonly _texts = inject(I18nStore).texts;

  protected readonly anchoredLeft = computed(() => (this.isCompact() ? null : `${this.leftOffset()}px`));

  protected readonly tabButtons = computed(() => {
    const popover = this._texts().timeframePopover;

    return [
      { tab: TIMEFRAME_TABS.QUICK, label: popover.quickTab },
      { tab: TIMEFRAME_TABS.ABSOLUTE, label: popover.absoluteTab },
    ];
  });

  protected showTab(tab: TimeframeTab): void {
    this.tab.set(tab);
  }
}
