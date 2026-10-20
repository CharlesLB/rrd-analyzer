import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import * as R from 'remeda';
import { ColorSwatchComponent, SWATCH_SIZES } from '../../../../shared/components/color-swatch/color-swatch.component';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { CrosshairReading } from '../../models/chart-reading/chart-reading';

const TOOLTIP_FLIP_FRACTION = 0.62;
const GAP_TIP_TOP = '50%';

@Component({
  selector: 'app-chart-crosshair',
  imports: [ColorSwatchComponent],
  templateUrl: './chart-crosshair.component.html',
  styleUrl: './chart-crosshair.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartCrosshairComponent {
  public readonly fraction = input.required<number>();
  public readonly time = input.required<string>();
  public readonly readings = input.required<readonly CrosshairReading[]>();

  protected readonly swatchSize = SWATCH_SIZES.SMALL;

  protected readonly left = computed(() => percentOf(this.fraction()));
  protected readonly isFlipped = computed(() => this.fraction() > TOOLTIP_FLIP_FRACTION);
  protected readonly texts = inject(I18nStore).texts;
  protected readonly isOverGap = computed(() => this.readings().length === 0);
  protected readonly tipTop = computed(() => R.first(this.readings())?.top ?? GAP_TIP_TOP);
}
