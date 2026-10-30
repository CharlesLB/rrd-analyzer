import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ThemeStore } from '@rrd-analyzer/ui-shared';
import { LANDING_CONFIGURATION, PROJECT_LINKS } from '../../../../core/config/landing.config';
import { DocumentHeadService } from '../../../../core/document-head/document-head.service';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { ReleasesStore } from '../../../../stores/releases/store/releases-store/releases.store';
import { DemoSectionComponent } from '../../components/demo-section/demo-section.component';
import { DonateSectionComponent } from '../../components/donate-section/donate-section.component';
import { DownloadSectionComponent } from '../../components/download-section/download-section.component';
import { FeaturesComponent } from '../../components/features/features.component';
import { HeroComponent } from '../../components/hero/hero.component';
import { SiteFooterComponent } from '../../components/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../components/site-header/site-header.component';
import { downloadCallOf } from '../../models/download-call/download-call.model';
import { homeHeadOf } from '../../models/home-head/home-head.model';
import { SECTION_IDS } from '../../models/page-sections/page-sections.model';

@Component({
  selector: 'app-home-page',
  imports: [SiteHeaderComponent, HeroComponent, FeaturesComponent, DemoSectionComponent, DownloadSectionComponent, DonateSectionComponent, SiteFooterComponent],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  private readonly _releases = inject(ReleasesStore);
  private readonly _themes = inject(ThemeStore);
  private readonly _i18n = inject(I18nStore);
  private readonly _texts = this._i18n.texts;
  private readonly _documentHead = inject(DocumentHeadService);

  protected readonly topId = SECTION_IDS.TOP;
  protected readonly version = this._releases.version;
  protected readonly platforms = this._releases.platforms;
  protected readonly downloadCall = computed(() => downloadCallOf(this._releases.primaryDownload(), this.version, this._texts()));

  public constructor() {
    this._describeForSearchAndPreviews();
    afterNextRender(() => this._releases.detectVisitorPlatform());
  }

  protected toggleTheme(): void {
    this._themes.toggle();
  }

  private _describeForSearchAndPreviews(): void {
    const head = homeHeadOf({
      texts: this._texts(),
      language: this._i18n.locale(),
      siteUrl: LANDING_CONFIGURATION.siteUrl,
      version: this.version,
      repositoryUrl: PROJECT_LINKS.repository,
      releasesUrl: PROJECT_LINKS.releases,
      platforms: this.platforms(),
    });

    this._documentHead.writeMetaTags(head.metaTags);
    this._documentHead.linkCanonical(head.canonicalUrl);
    this._documentHead.embedStructuredData(head.structuredData);
  }
}
