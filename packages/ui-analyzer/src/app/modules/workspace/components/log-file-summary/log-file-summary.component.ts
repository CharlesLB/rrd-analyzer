import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FilePickDirective } from '../../../../shared/directives/file-pick/file-pick.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { logFormatOf } from '../../../../stores/logs/models/log-format/log-format';
import { LOG_FILE_ACCEPT } from '../../../../stores/logs/models/log-source/log-source';

@Component({
  selector: 'app-log-file-summary',
  imports: [FilePickDirective],
  templateUrl: './log-file-summary.component.html',
  styleUrl: './log-file-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogFileSummaryComponent {
  public readonly fileName = input.required<string>();
  public readonly meta = input.required<string>();

  public readonly filePicked = output<File>();
  public readonly removeRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly accept = LOG_FILE_ACCEPT;
  protected readonly badge = computed(() => this.texts().logs.setup.fileBadges[logFormatOf(this.fileName())]);
}
