import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { ColorPaletteComponent } from '../../../../shared/components/color-palette/color-palette.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-log-color-row',
  imports: [ColorPaletteComponent],
  templateUrl: './log-color-row.component.html',
  styleUrl: './log-color-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogColorRowComponent {
  public readonly name = input.required<string>();
  public readonly count = input.required<string>();
  public readonly color = input.required<string>();
  public readonly isOpen = input.required<boolean>();
  public readonly canReset = input.required<boolean>();

  public readonly toggled = output<void>();
  public readonly colorChosen = output<string>();
  public readonly resetRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly changeLabel = computed(() => formatMessage(this.texts().logs.setup.changeColor, { type: this.name() }));
}
