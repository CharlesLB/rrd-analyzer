import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { type LeftEdgeAnchor, leftEdgeAnchorOf } from '../../utils/anchored-popover/anchored-popover.util';
import { ColorSwatchComponent, SWATCH_SIZES, type SwatchSize } from '../color-swatch/color-swatch.component';

@Component({
  selector: 'app-color-picker-swatch',
  imports: [ColorSwatchComponent],
  templateUrl: './color-picker-swatch.component.html',
  styleUrl: './color-picker-swatch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorPickerSwatchComponent {
  public readonly color = input.required<string>();
  public readonly label = input.required<string>();
  public readonly isOpen = input<boolean>(false);
  public readonly size = input<SwatchSize>(SWATCH_SIZES.MEDIUM);

  public readonly pickRequested = output<LeftEdgeAnchor>();

  protected readonly anchorOf = leftEdgeAnchorOf;
}
