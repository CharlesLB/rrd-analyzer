import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FilePickDirective } from '../../../../shared/directives/file-pick/file-pick.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { LOG_FILE_ACCEPT, type LogFailure } from '../../../../stores/logs/models/log-source/log-source';

@Component({
  selector: 'app-log-setup-failure',
  imports: [FilePickDirective],
  templateUrl: './log-setup-failure.component.html',
  styleUrl: './log-setup-failure.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogSetupFailureComponent {
  public readonly failure = input.required<LogFailure | null>();
  public readonly fileName = input.required<string>();

  public readonly filePicked = output<File>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly accept = LOG_FILE_ACCEPT;
}
