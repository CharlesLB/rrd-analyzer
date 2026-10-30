import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PROJECT_LINKS } from '../../../../core/config/landing.config';
import { META_NAMES, ROBOTS_DIRECTIVES } from '../../../../core/document-head/document-head.model';
import { DocumentHeadService } from '../../../../core/document-head/document-head.service';
import { BrandComponent } from '../../../../shared/components/brand/brand.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

const HOME_ADDRESS = '/';

@Component({
  selector: 'app-not-found-page',
  imports: [BrandComponent],
  templateUrl: './not-found-page.component.html',
  styleUrl: './not-found-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {
  protected readonly texts = inject(I18nStore).texts;
  protected readonly homeAddress = HOME_ADDRESS;
  protected readonly browserAppAddress = PROJECT_LINKS.browserApp;

  public constructor() {
    inject(DocumentHeadService).writeMetaTags([
      { name: META_NAMES.DESCRIPTION, content: this.texts().notFound.description },
      { name: META_NAMES.ROBOTS, content: ROBOTS_DIRECTIVES.NO_INDEX },
    ]);
  }
}
