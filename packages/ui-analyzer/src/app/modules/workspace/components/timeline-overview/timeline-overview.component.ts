import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CanvasOverview } from '../../../../stores/workspace/models/series/series.model';
import { OVERVIEW_VIEW_BOX, overviewArtOf } from '../../models/timeline-strip/timeline-strip';

@Component({
  selector: 'app-timeline-overview',
  templateUrl: './timeline-overview.component.html',
  styleUrl: './timeline-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineOverviewComponent {
  public readonly overview = input.required<CanvasOverview>();

  protected readonly viewBox = OVERVIEW_VIEW_BOX;
  protected readonly art = computed(() => overviewArtOf(this.overview().samples));
}
