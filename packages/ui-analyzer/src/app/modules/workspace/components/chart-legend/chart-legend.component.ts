import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { ColorPickerSwatchComponent } from '../../../../shared/components/color-picker-swatch/color-picker-swatch.component';
import { SWATCH_SIZES } from '../../../../shared/components/color-swatch/color-swatch.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { ColorMenuRequest } from '../../../../stores/workspace/models/color-menu/color-menu';
import type { LegendEntry } from '../../models/chart-reading/chart-reading';

@Component({
  selector: 'app-chart-legend',
  imports: [ColorPickerSwatchComponent],
  templateUrl: './chart-legend.component.html',
  styleUrl: './chart-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartLegendComponent {
  public readonly entries = input.required<readonly LegendEntry[]>();

  public readonly pickingSeriesId = input<string | null>(null);

  public readonly colorMenuRequested = output<ColorMenuRequest>();

  private readonly _texts = inject(I18nStore).texts;

  protected readonly swatchSize = SWATCH_SIZES.SMALL;
  protected readonly labeledEntries = computed(() =>
    R.map(this.entries(), (entry) => ({ ...entry, colorLabel: formatMessage(this._texts().canvas.changeColor, { name: entry.name }) })),
  );
}
