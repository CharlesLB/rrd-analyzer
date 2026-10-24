import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ColorPickerSwatchComponent } from '../../../../shared/components/color-picker-swatch/color-picker-swatch.component';
import { SWATCH_SIZES } from '../../../../shared/components/color-swatch/color-swatch.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { type PopoverAnchor, popoverAnchorOf } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { ColorMenuRequest } from '../../../../stores/workspace/models/color-menu/color-menu';
import type { StatisticKey } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import type { HeaderStatistics } from '../../models/chart-statistics/chart-statistics';

const HEADER_CONTROL_SELECTOR = 'button';

const isOnHeaderControl = (target: EventTarget | null): boolean => target instanceof Element && target.closest(HEADER_CONTROL_SELECTOR) !== null;

type HeaderSwatch = {
  readonly seriesId: string;
  readonly color: string;
  readonly label: string;
  readonly isPicking: boolean;
};

@Component({
  selector: 'app-chart-panel-header',
  imports: [ColorPickerSwatchComponent],
  templateUrl: './chart-panel-header.component.html',
  styleUrl: './chart-panel-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartPanelHeaderComponent {
  public readonly swatches = input.required<readonly HeaderSwatch[]>();
  public readonly title = input.required<string>();
  public readonly unitLabel = input.required<string>();
  public readonly isMerged = input.required<boolean>();
  public readonly seriesButtonLabel = input.required<string>();
  public readonly statistics = input.required<HeaderStatistics>();
  public readonly isSeriesMenuOpen = input.required<boolean>();
  public readonly isExportMenuOpen = input.required<boolean>();

  public readonly referenceLineToggled = output<StatisticKey>();
  public readonly seriesMenuRequested = output<PopoverAnchor>();
  public readonly exportMenuRequested = output<PopoverAnchor>();
  public readonly removeRequested = output<void>();
  public readonly colorMenuRequested = output<ColorMenuRequest>();
  public readonly dragStarted = output<DragEvent>();
  public readonly dragEnded = output<void>();

  private readonly _pressStartedOnControl = signal(false);

  protected readonly swatchSize = SWATCH_SIZES.LARGE;

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly anchorOf = popoverAnchorOf;

  protected notePressOrigin(event: PointerEvent): void {
    this._pressStartedOnControl.set(isOnHeaderControl(event.target));
  }

  protected startDrag(event: DragEvent): void {
    if (this._pressStartedOnControl()) {
      event.preventDefault();

      return;
    }

    this.dragStarted.emit(event);
  }
}
