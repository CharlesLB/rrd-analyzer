import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ValueOf } from '../../../types/value-of';

export const CHEVRON_DIRECTIONS = {
  LEFT: 'left',
  RIGHT: 'right',
} as const;

export type ChevronDirection = ValueOf<typeof CHEVRON_DIRECTIONS>;

const CHEVRON_PATHS: Readonly<Record<ChevronDirection, string>> = {
  [CHEVRON_DIRECTIONS.LEFT]: 'M10 3.5 5.5 8l4.5 4.5',
  [CHEVRON_DIRECTIONS.RIGHT]: 'M6 3.5 10.5 8 6 12.5',
};

@Component({
  selector: 'app-chevron-icon',
  templateUrl: './chevron-icon.component.html',
  styleUrl: './chevron-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChevronIconComponent {
  public readonly pointsTo = input.required<ChevronDirection>();

  protected readonly path = computed(() => CHEVRON_PATHS[this.pointsTo()]);
}
