import { afterNextRender, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { DismissOnScrimDirective } from '../../../../shared/directives/dismiss-on-scrim/dismiss-on-scrim.directive';
import { FocusTrapDirective } from '../../../../shared/directives/focus-trap/focus-trap.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

const DIALOG_TITLE_ID = 'share-warning-dialog-title';

@Component({
  selector: 'app-share-warning-dialog',
  imports: [DismissOnScrimDirective, FocusTrapDirective],
  templateUrl: './share-warning-dialog.component.html',
  styleUrl: './share-warning-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class ShareWarningDialogComponent {
  public readonly fileCount = input.required<number>();
  public readonly hasLog = input.required<boolean>();
  public readonly isBusy = input.required<boolean>();

  public readonly confirmed = output<void>();
  public readonly closed = output<void>();

  private readonly _cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');

  protected readonly titleId = DIALOG_TITLE_ID;
  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;

  protected readonly uploads = computed(() => {
    const warning = this.texts().sharing.warning;

    return formatPlural(this.hasLog() ? warning.uploadsWithLog : warning.uploads, this.fileCount());
  });

  protected readonly confirmLabel = computed(() => (this.isBusy() ? this.texts().sharing.warning.confirming : this.texts().sharing.warning.confirm));

  public constructor() {
    afterNextRender(() => this._cancelButton().nativeElement.focus());
  }

  protected close(): void {
    if (!this.isBusy()) {
      this.closed.emit();
    }
  }
}
