import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PROJECT_LINKS } from '../../../../core/config/landing.config';
import { ExternalLinkComponent } from '../../../../shared/components/external-link/external-link.component';
import { DownloadIconComponent } from '../../../../shared/components/icons/download-icon/download-icon.component';
import { ExternalLinkIconComponent } from '../../../../shared/components/icons/external-link-icon/external-link-icon.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { PlatformDownloads } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';

const FIRST_FILE_INDEX = 0;

@Component({
  selector: 'app-platform-card',
  imports: [ExternalLinkComponent, DownloadIconComponent, ExternalLinkIconComponent],
  templateUrl: './platform-card.component.html',
  styleUrl: './platform-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformCardComponent {
  public readonly downloads = input.required<PlatformDownloads>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly buildFromSourceLink = PROJECT_LINKS.buildFromSource;
  protected readonly platformTexts = computed(() => this.texts().download.platforms[this.downloads().platform]);
  protected readonly isPackaged = computed(() => this.downloads().files.length > 0);
  protected readonly files = computed(() =>
    this.downloads().files.map((file, index) => ({
      ...file,
      label: this.texts().download.files[file.kind],
      isPrimary: this.downloads().isVisitors && index === FIRST_FILE_INDEX,
    })),
  );
}
