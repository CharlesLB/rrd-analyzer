import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PROJECT_LINKS } from '../../../../core/config/landing.config';
import { BrowserFrameComponent } from '../../../../shared/components/browser-frame/browser-frame.component';
import { ArrowRightIconComponent } from '../../../../shared/components/icons/arrow-right-icon/arrow-right-icon.component';
import { PlayIconComponent } from '../../../../shared/components/icons/play-icon/play-icon.component';
import { SectionHeadingComponent } from '../../../../shared/components/section-heading/section-heading.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { SECTION_ANCHORS, SECTION_IDS } from '../../models/page-sections/page-sections.model';
import { SCREENSHOTS } from '../../models/screenshots/screenshots.model';

@Component({
  selector: 'app-demo-section',
  imports: [BrowserFrameComponent, ArrowRightIconComponent, PlayIconComponent, SectionHeadingComponent],
  templateUrl: './demo-section.component.html',
  styleUrl: './demo-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoSectionComponent {
  protected readonly texts = inject(I18nStore).texts;
  protected readonly sectionId = SECTION_IDS.DEMO;
  protected readonly downloadAnchor = SECTION_ANCHORS.DOWNLOAD;
  protected readonly appLink = PROJECT_LINKS.browserApp;
  protected readonly poster = SCREENSHOTS.LOGS;
}
