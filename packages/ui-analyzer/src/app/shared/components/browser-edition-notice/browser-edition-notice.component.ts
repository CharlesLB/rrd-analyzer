import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-browser-edition-notice',
  templateUrl: './browser-edition-notice.component.html',
  styleUrl: './browser-edition-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowserEditionNoticeComponent {
  public readonly offlineDownloadUrl = input.required<string>();

  protected readonly texts = inject(I18nStore).texts;
}
