import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { Finding } from '../../../../stores/insights/models/finding/finding.model';
import { INSIGHT_STATUSES, type InsightStatus, RUN_STAGE_COUNT } from '../../../../stores/insights/models/insights-run/insights-run';
import { findingCountLabelOf } from '../../models/finding-label/finding-label';
import { MUTED_COLOR, SEVERITY_TONES } from '../../models/severity-tone/severity-tone';

const PROGRESS_DECIMALS = 0;

@Component({
  selector: 'app-insights-trigger',
  templateUrl: './insights-trigger.component.html',
  styleUrl: './insights-trigger.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsTriggerComponent {
  public readonly status = input.required<InsightStatus>();
  public readonly stageIndex = input.required<number>();
  public readonly progress = input.required<number>();
  public readonly findings = input.required<readonly Finding[]>();
  public readonly isStale = input.required<boolean>();
  public readonly isShown = input.required<boolean>();

  public readonly runRequested = output<void>();
  public readonly cancelRequested = output<void>();
  public readonly panelToggled = output<void>();
  public readonly shownToggled = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly statuses = INSIGHT_STATUSES;

  protected readonly stageLabel = computed(() => {
    const insights = this.texts().insights;

    return formatMessage(insights.stageLabel, { stage: insights.stages[this.stageIndex()] ?? '' });
  });

  protected readonly stageStep = computed(() => formatMessage(this.texts().insights.stageStep, { step: this.stageIndex() + 1, total: RUN_STAGE_COUNT }));
  protected readonly progressWidth = computed(() => percentOf(this.progress(), PROGRESS_DECIMALS));
  protected readonly countLabel = computed(() => findingCountLabelOf(this.findings(), this.texts().insights));
  protected readonly pillTip = computed(() => (this.isStale() ? this.texts().insights.staleTip : this.texts().insights.toggleTip));

  protected readonly badgeColor = computed(() => {
    const [top] = this.findings();

    return top === undefined ? MUTED_COLOR : SEVERITY_TONES[top.severity].foreground;
  });
}
