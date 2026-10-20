import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { ReleasesStore } from '../../../../stores/releases/store/releases-store/releases.store';
import { ThemeStore } from '../../../../stores/theme/store/theme-store/theme.store';
import { DemoSectionComponent } from '../../components/demo-section/demo-section.component';
import { DonateSectionComponent } from '../../components/donate-section/donate-section.component';
import { DownloadSectionComponent } from '../../components/download-section/download-section.component';
import { FeaturesComponent } from '../../components/features/features.component';
import { HeroComponent } from '../../components/hero/hero.component';
import { SiteFooterComponent } from '../../components/site-footer/site-footer.component';
import { SiteHeaderComponent } from '../../components/site-header/site-header.component';
import { downloadCallOf } from '../../models/download-call/download-call.model';
import { SECTION_IDS } from '../../models/page-sections/page-sections.model';

const DESCRIPTION_META_NAME = 'description';

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
  private readonly _texts = inject(I18nStore).texts;

  protected readonly topId = SECTION_IDS.TOP;
  protected readonly version = this._releases.version;
  protected readonly platforms = this._releases.platforms;
  protected readonly downloadCall = computed(() => downloadCallOf(this._releases.primaryDownload(), this.version, this._texts()));

  public constructor() {
    inject(Meta).updateTag({ name: DESCRIPTION_META_NAME, content: this._texts().meta.description });
    afterNextRender(() => this._releases.detectVisitorPlatform());
  }

  protected toggleTheme(): void {
    this._themes.toggle();
  }
}
