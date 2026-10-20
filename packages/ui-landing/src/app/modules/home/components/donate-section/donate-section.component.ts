import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PROJECT_LINKS } from '../../../../core/config/landing.config';
import { ExternalLinkComponent } from '../../../../shared/components/external-link/external-link.component';
import { ExternalLinkIconComponent } from '../../../../shared/components/icons/external-link-icon/external-link-icon.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { SECTION_IDS } from '../../models/page-sections/page-sections.model';

@Component({
  selector: 'app-donate-section',
  imports: [ExternalLinkComponent, ExternalLinkIconComponent],
  templateUrl: './donate-section.component.html',
  styleUrl: './donate-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateSectionComponent {
  protected readonly texts = inject(I18nStore).texts;
  protected readonly sectionId = SECTION_IDS.DONATE;
  protected readonly donationLink = PROJECT_LINKS.donation;
}
