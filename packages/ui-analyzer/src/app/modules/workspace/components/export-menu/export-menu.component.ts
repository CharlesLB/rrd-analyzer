import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { AnchoredMenuComponent } from '../../../../shared/components/anchored-menu/anchored-menu.component';
import { ColorSwatchComponent } from '../../../../shared/components/color-swatch/color-swatch.component';
import type { PopoverPlacement } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { EXPORT_FRAME } from '../../../../stores/export/models/export-layout/export-layout';
import { EXPORT_FORMATS, EXPORT_MENU_FORMATS, EXPORT_MENU_SIZE, type ExportFormat } from '../../../../stores/export/models/export-menu/export-menu';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

type ExportMenuItem = {
  readonly format: ExportFormat;
  readonly tag: string;
  readonly title: string;
  readonly detail: string;
};

const SINGLE_CHART = 1;
const SINGLE_SERIES = 1;

@Component({
  selector: 'app-export-menu',
  imports: [AnchoredMenuComponent, ColorSwatchComponent],
  templateUrl: './export-menu.component.html',
  styleUrl: './export-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportMenuComponent {
  public readonly color = input.required<string>();
  public readonly scopeLabel = input.required<string>();
  public readonly placement = input.required<PopoverPlacement>();
  public readonly chartCount = input.required<number>();
  public readonly seriesCount = input(SINGLE_SERIES);

  public readonly formatChosen = output<ExportFormat>();
  public readonly allChartsRequested = output<void>();
  public readonly closeRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly menuWidth = EXPORT_MENU_SIZE.width;

  protected readonly items = computed<readonly ExportMenuItem[]>(() => {
    const messages = this.texts().export;
    const frame = { width: EXPORT_FRAME.WIDTH, height: EXPORT_FRAME.HEIGHT };

    return R.map(EXPORT_MENU_FORMATS, (format) => ({
      format,
      tag: messages[format].tag,
      title: messages[format].title,
      detail: formatMessage(this._describesSeveralSeries(format) ? messages.csvMergedDetail : messages[format].detail, { ...frame, count: this.seriesCount() }),
    }));
  });

  protected readonly offersAllCharts = computed(() => this.chartCount() > SINGLE_CHART);
  protected readonly allChartsLabel = computed(() => formatMessage(this.texts().export.allCharts, { count: this.chartCount() }));

  private _describesSeveralSeries(format: ExportFormat): boolean {
    return format === EXPORT_FORMATS.CSV && this.seriesCount() > SINGLE_SERIES;
  }
}
