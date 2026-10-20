import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'a[appExternalLink]',
  templateUrl: './external-link.component.html',
  styleUrl: './external-link.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { target: '_blank', rel: 'noopener' },
})
export class ExternalLinkComponent {
  protected readonly texts = inject(I18nStore).texts;
}
