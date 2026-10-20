import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { BrowserFrameComponent } from '../../../../shared/components/browser-frame/browser-frame.component';
import { ArrowRightIconComponent } from '../../../../shared/components/icons/arrow-right-icon/arrow-right-icon.component';
import { DownloadIconComponent } from '../../../../shared/components/icons/download-icon/download-icon.component';
import { PlayIconComponent } from '../../../../shared/components/icons/play-icon/play-icon.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { DownloadCall } from '../../models/download-call/download-call.model';
import { SECTION_ANCHORS } from '../../models/page-sections/page-sections.model';
import { SCREENSHOTS } from '../../models/screenshots/screenshots.model';

@Component({
  selector: 'app-hero',
  imports: [BrowserFrameComponent, ArrowRightIconComponent, DownloadIconComponent, PlayIconComponent],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroComponent {
  public readonly version = input.required<string>();
  public readonly downloadCall = input.required<DownloadCall>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly anchors = SECTION_ANCHORS;
  protected readonly lightScreenshot = SCREENSHOTS.WORKSPACE;
  protected readonly darkScreenshot = SCREENSHOTS.WORKSPACE_DARK;
  protected readonly versionLabel = computed(() => formatMessage(this.texts().common.version, { version: this.version() }));
}
