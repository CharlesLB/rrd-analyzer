import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ValueOf } from '../../types/value-of';

export const SWATCH_SIZES = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large',
} as const;

export type SwatchSize = ValueOf<typeof SWATCH_SIZES>;

@Component({
  selector: 'app-color-swatch',
  templateUrl: './color-swatch.component.html',
  styleUrl: './color-swatch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorSwatchComponent {
  public readonly color = input.required<string>();
  public readonly size = input<SwatchSize>(SWATCH_SIZES.MEDIUM);

  protected readonly isSmall = computed(() => this.size() === SWATCH_SIZES.SMALL);
  protected readonly isLarge = computed(() => this.size() === SWATCH_SIZES.LARGE);
}
