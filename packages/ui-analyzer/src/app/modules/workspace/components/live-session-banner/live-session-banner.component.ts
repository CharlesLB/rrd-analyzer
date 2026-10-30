import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-live-session-banner',
  templateUrl: './live-session-banner.component.html',
  styleUrl: './live-session-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveSessionBannerComponent {
  public readonly minutesLeft = input.required<number>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly expiry = computed(() => formatPlural(this.texts().sharing.viewer.expiry, this.minutesLeft()));
}
