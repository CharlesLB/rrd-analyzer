import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';

const APPLICATION_ICON = 'app-icon.svg';

@Component({
  selector: 'app-brand',
  templateUrl: './brand.component.html',
  styleUrl: './brand.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandComponent {
  public readonly isCompact = input(false);

  protected readonly texts = inject(I18nStore).texts;
  protected readonly icon = APPLICATION_ICON;
}
