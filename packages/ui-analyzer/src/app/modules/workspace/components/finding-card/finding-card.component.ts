import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { PressableDirective } from '../../../../shared/directives/pressable/pressable.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { Evidence, Finding } from '../../../../stores/insights/models/finding/finding.model';
import { findingIntervalOf } from '../../models/finding-label/finding-label';
import { SEVERITY_TONES } from '../../models/severity-tone/severity-tone';
import { EvidenceChipComponent } from '../evidence-chip/evidence-chip.component';

const NEAREST_EDGE: ScrollIntoViewOptions = { block: 'nearest' };

@Component({
  selector: 'app-finding-card',
  imports: [EvidenceChipComponent, PressableDirective],
  templateUrl: './finding-card.component.html',
  styleUrl: './finding-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FindingCardComponent {
  public readonly finding = input.required<Finding>();
  public readonly isOpen = input.required<boolean>();
  public readonly isFocused = input.required<boolean>();
  public readonly plottedColors = input.required<ReadonlyMap<string, string>>();

  public readonly toggled = output<void>();
  public readonly hovered = output<boolean>();
  public readonly showOnChartRequested = output<void>();
  public readonly evidenceJumpRequested = output<Evidence>();
  public readonly plotRequested = output<string>();

  private readonly _card = viewChild.required<ElementRef<HTMLElement>>('card');

  protected readonly texts = inject(I18nStore).texts;

  protected readonly tone = computed(() => SEVERITY_TONES[this.finding().severity]);
  protected readonly background = computed(() => (this.isOpen() ? this.tone().surface : null));
  protected readonly severityLabel = computed(() => this.texts().insights.severities[this.finding().severity]);
  protected readonly interval = computed(() => findingIntervalOf(this.finding()));

  protected readonly disclosure = computed(
    () => `${this.isOpen() ? GLYPHS.CARET : GLYPHS.COLLAPSED} ${formatMessage(this.texts().insights.evidenceCount, { count: this.finding().evidence.length })}`,
  );

  protected readonly evidenceRows = computed(() =>
    this.finding().evidence.map((evidence) => ({ evidence, plottedColor: this.plottedColors().get(evidence.seriesId) ?? null })),
  );

  public constructor() {
    afterRenderEffect(() => {
      if (this.isFocused()) {
        this._card().nativeElement.scrollIntoView(NEAREST_EDGE);
      }
    });
  }
}
