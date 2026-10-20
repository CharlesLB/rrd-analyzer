import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-brand-mark',
  templateUrl: './brand-mark.component.html',
  styleUrl: './brand-mark.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {
  protected readonly texts = inject(I18nStore).texts;
}
