import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage, formatPlural } from '@rrd-analyzer/shared';
import { OPTION_MENU_SIZES, type OptionMenuItem } from '../../../../shared/components/option-menu/option-menu.component';
import { OptionSelectComponent } from '../../../../shared/components/option-select/option-select.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { memberOf } from '../../../../shared/utils/constant-member/constant-member.util';
import { formatClockWithSeconds } from '../../../../shared/utils/date-format/date-format.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { AnalyzedRun } from '../../../../stores/insights/models/analyzed-run/analyzed-run';
import { type Evidence, type EvidenceJump, type Finding, INSIGHT_SCOPES, type InsightScope } from '../../../../stores/insights/models/finding/finding.model';
import { STALE_REASONS, type StaleReason } from '../../../../stores/insights/models/insights-run/insights-run';
import { timestampRangeOf } from '../../../../stores/workspace/models/timeframe/timeframe';
import { FindingCardComponent } from '../finding-card/finding-card.component';
import { SidePanelComponent } from '../side-panel/side-panel.component';

const PANEL_WIDTH = 316;

@Component({
  selector: 'app-insights-panel',
  imports: [FindingCardComponent, OptionSelectComponent, SidePanelComponent],
  templateUrl: './insights-panel.component.html',
  styleUrl: './insights-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightsPanelComponent {
  public readonly findings = input.required<readonly Finding[]>();
  public readonly focusIndex = input.required<number>();
  public readonly expanded = input.required<Readonly<Record<string, boolean>>>();
  public readonly scope = input.required<InsightScope>();
  public readonly staleReason = input.required<StaleReason | null>();
  public readonly analyzedRun = input.required<AnalyzedRun | null>();
  public readonly plottedColors = input.required<ReadonlyMap<string, string>>();
  public readonly areOverlaysHidden = input(false);

  public readonly closeRequested = output<void>();
  public readonly overlaysToggled = output<void>();
  public readonly scopeChosen = output<InsightScope>();
  public readonly rerunRequested = output<void>();
  public readonly findingToggled = output<number>();
  public readonly findingHovered = output<string | null>();
  public readonly showOnChartRequested = output<Finding>();
  public readonly evidenceJumpRequested = output<EvidenceJump>();
  public readonly plotRequested = output<string>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly panelWidth = PANEL_WIDTH;
  protected readonly glyphs = GLYPHS;
  protected readonly compactMenu = OPTION_MENU_SIZES.COMPACT;

  protected readonly findingRows = computed(() =>
    this.findings().map((finding, index) => ({ finding, index, isOpen: this.expanded()[finding.id] === true, isFocused: index === this.focusIndex() })),
  );

  protected readonly overlaysToggle = computed(() => {
    const insights = this.texts().insights;

    return this.areOverlaysHidden()
      ? { label: insights.showOnCharts, tip: insights.showOnChartsTip }
      : { label: insights.hideOnCharts, tip: insights.hideOnChartsTip };
  });

  protected readonly staleBanner = computed(() => {
    const insights = this.texts().insights;

    return this.staleReason() === STALE_REASONS.CONFIGURATION ? insights.staleConfigurationBanner : insights.staleBanner;
  });

  protected readonly rankedLabel = computed(() =>
    this.findings().length === 0 ? '' : formatMessage(this.texts().insights.rankedCount, { count: this.findings().length }),
  );

  protected readonly scopeItems = computed<readonly OptionMenuItem[]>(() => [
    { value: INSIGHT_SCOPES.ALL, label: this.texts().insights.scopeAll },
    { value: INSIGHT_SCOPES.VIEWPORT, label: this.texts().insights.scopeViewport },
  ]);

  protected readonly ranAtLabel = computed(() => {
    const run = this.analyzedRun();

    return run === null ? '' : formatMessage(this.texts().insights.ranAt, { time: formatClockWithSeconds(run.ranAtMilliseconds) });
  });

  protected readonly unclassifiedNote = computed(() => {
    const labels = this.analyzedRun()?.unclassifiedLabels ?? [];
    const insights = this.texts().insights;

    return labels.length === 0
      ? ''
      : `${formatPlural(insights.unclassified, labels.length, { labels: labels.join(this.texts().application.listSeparator) })} ${insights.classificationNote}`;
  });

  protected readonly analyzedLine = computed(() => {
    const run = this.analyzedRun();
    const insights = this.texts().insights;

    if (run === null) {
      return '';
    }

    const template = run.scope === INSIGHT_SCOPES.VIEWPORT ? insights.analyzedViewport : insights.analyzedAll;

    return formatMessage(template, timestampRangeOf(run.window));
  });

  protected chooseScope(value: string): void {
    this.scopeChosen.emit(memberOf(INSIGHT_SCOPES, value) ?? INSIGHT_SCOPES.ALL);
  }

  protected hover(finding: Finding, isHovered: boolean): void {
    this.findingHovered.emit(isHovered ? finding.id : null);
  }

  protected jumpToEvidence(finding: Finding, evidence: Evidence): void {
    this.evidenceJumpRequested.emit({ finding, evidence });
  }
}
