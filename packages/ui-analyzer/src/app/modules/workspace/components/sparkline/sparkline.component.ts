import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SeriesSample } from '../../../../stores/workspace/models/series/series.model';
import { SPARKLINE_VIEW_BOX, thumbnailArtOf } from '../../models/sparkline-path/sparkline-path';

@Component({
  selector: 'app-sparkline',
  templateUrl: './sparkline.component.html',
  styleUrl: './sparkline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SparklineComponent {
  public readonly samples = input.required<readonly SeriesSample[]>();
  public readonly color = input.required<string>();
  public readonly showsAreaFill = input.required<boolean>();

  protected readonly viewBox = SPARKLINE_VIEW_BOX;
  protected readonly art = computed(() => thumbnailArtOf(this.samples(), this.color(), this.showsAreaFill()));
}
