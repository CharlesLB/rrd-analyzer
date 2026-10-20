import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PressableDirective } from '../../../../shared/directives/pressable/pressable.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { Evidence, Severity } from '../../../../stores/insights/models/finding/finding.model';
import {
  evidenceBadgeOf,
  evidenceGlyphColorOf,
  evidenceGlyphOf,
  evidenceSpanOf,
  evidenceValuesOf,
  sparkColorOf,
} from '../../models/evidence-view/evidence-view';
import { EvidenceSparkComponent } from '../evidence-spark/evidence-spark.component';

@Component({
  selector: 'app-evidence-chip',
  imports: [EvidenceSparkComponent, PressableDirective],
  templateUrl: './evidence-chip.component.html',
  styleUrl: './evidence-chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceChipComponent {
  public readonly evidence = input.required<Evidence>();
  public readonly severity = input.required<Severity>();
  public readonly plottedColor = input.required<string | null>();

  public readonly jumpRequested = output<void>();
  public readonly plotRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;

  protected readonly badge = computed(() => evidenceBadgeOf(this.plottedColor()));
  protected readonly glyph = computed(() => evidenceGlyphOf(this.evidence()));
  protected readonly glyphColor = computed(() => evidenceGlyphColorOf(this.evidence(), this.severity()));
  protected readonly sparkColor = computed(() => sparkColorOf(this.plottedColor()));
  protected readonly values = computed(() => evidenceValuesOf(this.evidence(), this.texts().insights, this.texts().units));
  protected readonly span = computed(() => evidenceSpanOf(this.evidence()));

  protected plot(event: Event): void {
    event.stopPropagation();
    this.plotRequested.emit();
  }
}
