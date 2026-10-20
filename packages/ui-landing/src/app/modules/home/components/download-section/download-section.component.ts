import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { PROJECT_LINKS } from '../../../../core/config/landing.config';
import { ExternalLinkComponent } from '../../../../shared/components/external-link/external-link.component';
import { ArrowRightIconComponent } from '../../../../shared/components/icons/arrow-right-icon/arrow-right-icon.component';
import { ExternalLinkIconComponent } from '../../../../shared/components/icons/external-link-icon/external-link-icon.component';
import { SectionHeadingComponent } from '../../../../shared/components/section-heading/section-heading.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { PlatformDownloads } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';
import { SECTION_ANCHORS, SECTION_IDS } from '../../models/page-sections/page-sections.model';
import { PlatformCardComponent } from '../platform-card/platform-card.component';

@Component({
  selector: 'app-download-section',
  imports: [ExternalLinkComponent, ArrowRightIconComponent, ExternalLinkIconComponent, SectionHeadingComponent, PlatformCardComponent],
  templateUrl: './download-section.component.html',
  styleUrl: './download-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DownloadSectionComponent {
  public readonly version = input.required<string>();
  public readonly platforms = input.required<readonly PlatformDownloads[]>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly sectionId = SECTION_IDS.DOWNLOAD;
  protected readonly demoAnchor = SECTION_ANCHORS.DEMO;
  protected readonly links = PROJECT_LINKS;
  protected readonly addedMark = GLYPHS.ADDED;
  protected readonly title = computed(() => formatMessage(this.texts().download.title, { version: this.version() }));
  protected readonly whatsNew = computed(() => formatMessage(this.texts().download.whatsNew, { version: this.version() }));
}
