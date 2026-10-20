import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { AnchoredMenuComponent } from '../../../../shared/components/anchored-menu/anchored-menu.component';
import { ColorSwatchComponent } from '../../../../shared/components/color-swatch/color-swatch.component';
import { OPTION_MENU_SIZES, type OptionMenuItem } from '../../../../shared/components/option-menu/option-menu.component';
import { OptionSelectComponent } from '../../../../shared/components/option-select/option-select.component';
import type { PopoverPlacement } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { unitLabelOf } from '../../../../shared/utils/value-format/value-format.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { AxisChoice } from '../../../../stores/workspace/models/chart-axes/chart-axes';
import { SERIES_MENU_SIZE, type SeriesMenuRow } from '../../../../stores/workspace/models/series-menu/series-menu';

export type AxisChange = {
  readonly seriesId: string;
  readonly axis: number;
};

type SeriesMenuLine = {
  readonly seriesId: string;
  readonly name: string;
  readonly color: string;
  readonly unitLabel: string;
  readonly selectedAxis: string;
  readonly axisItems: readonly OptionMenuItem[];
};

@Component({
  selector: 'app-chart-series-menu',
  imports: [AnchoredMenuComponent, ColorSwatchComponent, OptionSelectComponent],
  templateUrl: './chart-series-menu.component.html',
  styleUrl: './chart-series-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartSeriesMenuComponent {
  public readonly rows = input.required<readonly SeriesMenuRow[]>();
  public readonly placement = input.required<PopoverPlacement>();

  public readonly axisChosen = output<AxisChange>();
  public readonly separateRequested = output<void>();
  public readonly closeRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly menuWidth = SERIES_MENU_SIZE.width;
  protected readonly compactSize = OPTION_MENU_SIZES.COMPACT;

  protected readonly lines = computed<readonly SeriesMenuLine[]>(() =>
    R.map(this.rows(), (row) => ({
      seriesId: row.series.id,
      name: row.series.name,
      color: row.series.color,
      unitLabel: unitLabelOf(row.series.unit, this.texts().units),
      selectedAxis: `${row.axis}`,
      axisItems: R.map(row.choices, (choice) => ({ value: `${choice.axis}`, label: this._axisLabelOf(choice) })),
    })),
  );

  protected readonly separateLabel = computed(() => formatMessage(this.texts().seriesMenu.separate, { count: this.rows().length }));

  protected chooseAxis(seriesId: string, value: string): void {
    this.axisChosen.emit({ seriesId, axis: Number(value) });
  }

  private _axisLabelOf(choice: AxisChoice): string {
    const messages = this.texts().seriesMenu;

    return choice.isNew ? messages.newAxis : formatMessage(messages.axis, { number: choice.axis + 1 });
  }
}
