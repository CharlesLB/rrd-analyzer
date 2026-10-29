import { afterNextRender, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import { MODAL_DIALOG_ROLES, ModalDialogComponent } from '../../../../shared/components/modal-dialog/modal-dialog.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-share-warning-dialog',
  imports: [ModalDialogComponent],
  templateUrl: './share-warning-dialog.component.html',
  styleUrl: './share-warning-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareWarningDialogComponent {
  public readonly fileCount = input.required<number>();
  public readonly hasLog = input.required<boolean>();
  public readonly isBusy = input.required<boolean>();

  public readonly confirmed = output<void>();
  public readonly closed = output<void>();

  private readonly _cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');

  protected readonly alertRole = MODAL_DIALOG_ROLES.ALERT;
  protected readonly texts = inject(I18nStore).texts;

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
