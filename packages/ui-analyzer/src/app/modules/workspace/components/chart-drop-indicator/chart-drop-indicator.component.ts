import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { DROP_POSITIONS, type DropPosition } from '../../../../stores/workspace/models/canvas-operations/canvas-operations';

const POSITION_CLASSES: Readonly<Record<DropPosition, string>> = {
  [DROP_POSITIONS.BEFORE]: 'chart-drop-indicator-before',
  [DROP_POSITIONS.AFTER]: 'chart-drop-indicator-after',
  [DROP_POSITIONS.MERGE]: 'chart-drop-indicator-merge',
};

@Component({
  selector: 'app-chart-drop-indicator',
  templateUrl: './chart-drop-indicator.component.html',
  styleUrl: './chart-drop-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartDropIndicatorComponent {
  public readonly position = input.required<DropPosition>();

  private readonly _texts = inject(I18nStore).texts;

  protected readonly positionClass = computed(() => POSITION_CLASSES[this.position()]);

  protected readonly label = computed(() => {
    const canvas = this._texts().canvas;

    const labels: Readonly<Record<DropPosition, string | null>> = {
      [DROP_POSITIONS.BEFORE]: null,
      [DROP_POSITIONS.AFTER]: null,
      [DROP_POSITIONS.MERGE]: canvas.merge,
    };

    return labels[this.position()];
  });
}
