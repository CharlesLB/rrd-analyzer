import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { MissingSource } from '../../../../stores/workspace/models/opening-failure/opening-failure';

@Component({
  selector: 'app-analysis-unavailable',
  templateUrl: './analysis-unavailable.component.html',
  styleUrl: './analysis-unavailable.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisUnavailableComponent {
  public readonly missingSources = input.required<readonly MissingSource[]>();

  public readonly retryRequested = output<void>();
  public readonly backRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly hasMissingSources = computed(() => this.missingSources().length > 0);
  protected readonly missingSourcesSummary = computed(() => formatPlural(this.texts().analysisUnavailable.missingSources, this.missingSources().length));
}
