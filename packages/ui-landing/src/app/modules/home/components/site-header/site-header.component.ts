import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PROJECT_LINKS } from '../../../../core/config/landing.config';
import { BrandComponent } from '../../../../shared/components/brand/brand.component';
import { ExternalLinkComponent } from '../../../../shared/components/external-link/external-link.component';
import { DownloadIconComponent } from '../../../../shared/components/icons/download-icon/download-icon.component';
import { ExternalLinkIconComponent } from '../../../../shared/components/icons/external-link-icon/external-link-icon.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { DownloadCall } from '../../models/download-call/download-call.model';
import { SECTION_ANCHORS } from '../../models/page-sections/page-sections.model';

const SITE_MENU_ID = 'site-menu';

@Component({
  selector: 'app-site-header',
  imports: [BrandComponent, ExternalLinkComponent, DownloadIconComponent, ExternalLinkIconComponent],
  templateUrl: './site-header.component.html',
  styleUrl: './site-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeaderComponent {
  public readonly downloadCall = input.required<DownloadCall>();

  private readonly _isMenuOpenState = signal(false);

  protected readonly texts = inject(I18nStore).texts;
  protected readonly links = PROJECT_LINKS;
  protected readonly topAnchor = SECTION_ANCHORS.TOP;
  protected readonly menuId = SITE_MENU_ID;
  protected readonly isMenuOpen = this._isMenuOpenState.asReadonly();
  protected readonly sections = computed(() => {
    const header = this.texts().header;

    return [
      { anchor: SECTION_ANCHORS.FEATURES, label: header.features },
      { anchor: SECTION_ANCHORS.DEMO, label: header.demo },
      { anchor: SECTION_ANCHORS.DOWNLOAD, label: header.download },
      { anchor: SECTION_ANCHORS.DONATE, label: header.donate },
    ];
  });

  protected toggleMenu(): void {
    this._isMenuOpenState.update((isOpen) => !isOpen);
  }

  protected closeMenu(): void {
    this._isMenuOpenState.set(false);
  }
}
