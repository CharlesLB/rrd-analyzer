import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import * as R from 'remeda';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';
import { PALETTE_COLORS } from '../../constants/colors';
import { ColorMixerComponent } from '../color-mixer/color-mixer.component';

@Component({
  selector: 'app-color-palette',
  imports: [ColorMixerComponent],
  templateUrl: './color-palette.component.html',
  styleUrl: './color-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorPaletteComponent {
  public readonly color = input.required<string>();

  public readonly colorChosen = output<string>();

  private readonly _isMixingState = signal(false);

  protected readonly texts = inject(I18nStore).texts;
  protected readonly isMixing = this._isMixingState.asReadonly();
  protected readonly swatches = computed(() => {
    const current = this.color().toLowerCase();

    return R.map(PALETTE_COLORS, (color) => ({ color, isCurrent: color.toLowerCase() === current }));
  });
  protected readonly isCustom = computed(() => !this.swatches().some((swatch) => swatch.isCurrent));

  protected toggleMixer(): void {
    this._isMixingState.update((isMixing) => !isMixing);
  }

  protected closeMixer(): void {
    this._isMixingState.set(false);
  }

  protected chooseMixed(color: string): void {
    this._isMixingState.set(false);
    this.colorChosen.emit(color);
  }
}
