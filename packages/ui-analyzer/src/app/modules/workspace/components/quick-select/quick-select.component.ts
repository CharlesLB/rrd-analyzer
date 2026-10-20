import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';
import type { OptionMenuItem } from '../../../../shared/components/option-menu/option-menu.component';
import { OptionSelectComponent } from '../../../../shared/components/option-select/option-select.component';
import { inputValueOf } from '../../../../shared/utils/input-value/input-value.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { quickCountOf } from '../../../../stores/time-window/models/quick-count/quick-count';
import { isQuickUnit, QUICK_PRESETS, QUICK_UNITS, type QuickPresetKey, type QuickUnit } from '../../../../stores/workspace/models/timeframe/timeframe';

@Component({
  selector: 'app-quick-select',
  imports: [OptionSelectComponent],
  templateUrl: './quick-select.component.html',
  styleUrl: './quick-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickSelectComponent {
  public readonly count = model.required<string>();
  public readonly unit = model.required<QuickUnit>();
  public readonly activePresetKey = input.required<QuickPresetKey | undefined>();

  public readonly applyRequested = output<void>();
  public readonly presetChosen = output<number>();
  public readonly closeRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly presets = QUICK_PRESETS;
  protected readonly isCountInvalid = computed(() => quickCountOf(this.count()) === null);

  protected readonly unitItems = computed<readonly OptionMenuItem[]>(() => {
    const labels = this.texts().timeframePopover.units;

    return Object.values(QUICK_UNITS).map((unit) => ({ value: unit, label: labels[unit] }));
  });

  protected typeCount(event: Event): void {
    this.count.set(inputValueOf(event));
  }

  protected apply(): void {
    if (!this.isCountInvalid()) {
      this.applyRequested.emit();
    }
  }

  protected chooseUnit(value: string): void {
    if (isQuickUnit(value)) {
      this.unit.set(value);
    }
  }
}
