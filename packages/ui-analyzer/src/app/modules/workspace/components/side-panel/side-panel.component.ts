import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { useMediaQuery } from '@rrd-analyzer/ui-shared';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { COMPACT_LAYOUT_QUERY } from '../../models/compact-layout/compact-layout';

@Component({
  selector: 'app-side-panel',
  templateUrl: './side-panel.component.html',
  styleUrl: './side-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--side-panel-width.px]': 'width()', '[class.side-panel-compact]': 'isCompact()' },
})
export class SidePanelComponent {
  public readonly title = input.required<string>();
  public readonly closeLabel = input.required<string>();
  public readonly width = input.required<number>();

  public readonly closeRequested = output<void>();

  protected readonly glyphs = GLYPHS;
  protected readonly isCompact = useMediaQuery(COMPACT_LAYOUT_QUERY);
}
