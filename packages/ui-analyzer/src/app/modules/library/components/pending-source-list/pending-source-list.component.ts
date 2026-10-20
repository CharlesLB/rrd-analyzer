import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { ColorSwatchComponent, SWATCH_SIZES } from '../../../../shared/components/color-swatch/color-swatch.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { formatFileSize, WHOLE_KILOBYTES } from '../../../../shared/utils/file-size/file-size.util';
import { paletteColorAt } from '../../../../shared/utils/series-palette/series-palette';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { PendingSource } from '../../../../stores/library/models/analysis/analysis.model';
import { sourceIdentityOf } from '../../../../stores/library/models/new-analysis-draft/new-analysis-draft';

type PendingSourceRow = {
  readonly identity: string;
  readonly name: string;
  readonly path: string;
  readonly size: string;
  readonly color: string;
  readonly index: number;
};

@Component({
  selector: 'app-pending-source-list',
  imports: [ColorSwatchComponent],
  templateUrl: './pending-source-list.component.html',
  styleUrl: './pending-source-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingSourceListComponent {
  public readonly sources = input.required<readonly PendingSource[]>();

  public readonly removed = output<number>();
  public readonly clearedAll = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly swatchSize = SWATCH_SIZES.LARGE;

  protected readonly rows = computed<readonly PendingSourceRow[]>(() =>
    R.map(this.sources(), (source, index) => ({
      identity: sourceIdentityOf(source),
      name: source.name,
      path: source.path,
      size: formatFileSize(source.size, this.texts().units, WHOLE_KILOBYTES),
      color: paletteColorAt(index),
      index,
    })),
  );

  protected readonly countLabel = computed(() => formatPlural(this.texts().newAnalysisDialog.fileCount, this.sources().length));
}
