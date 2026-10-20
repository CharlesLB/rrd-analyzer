import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TrashIconComponent } from '../../../../shared/components/icons/trash-icon/trash-icon.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { FilePickDirective } from '../../../../shared/directives/file-pick/file-pick.directive';
import { formatCount } from '../../../../shared/utils/count-format/count-format.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { LOG_FILE_ACCEPT } from '../../../../stores/logs/models/log-source/log-source';

@Component({
  selector: 'app-logs-trigger',
  imports: [FilePickDirective, TrashIconComponent],
  templateUrl: './logs-trigger.component.html',
  styleUrl: './logs-trigger.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsTriggerComponent {
  public readonly hasFile = input.required<boolean>();
  public readonly isShown = input.required<boolean>();
  public readonly entryCount = input.required<number | null>();
  public readonly isCompact = input.required<boolean>();

  public readonly filePicked = output<File>();
  public readonly toggled = output<void>();
  public readonly removeRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly accept = LOG_FILE_ACCEPT;

  protected readonly countLabel = computed(() => {
    const count = this.entryCount();

    return count === null ? '' : formatCount(count);
  });
}
