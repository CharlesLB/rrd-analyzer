import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EVIDENCE_SPARK_VIEW_BOX, sparkPathOf } from '../../models/evidence-view/evidence-view';

@Component({
  selector: 'app-evidence-spark',
  templateUrl: './evidence-spark.component.html',
  styleUrl: './evidence-spark.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvidenceSparkComponent {
  public readonly points = input.required<readonly (number | null)[]>();
  public readonly color = input.required<string>();

  protected readonly viewBox = EVIDENCE_SPARK_VIEW_BOX;
  protected readonly path = computed(() => sparkPathOf(this.points()));
}
