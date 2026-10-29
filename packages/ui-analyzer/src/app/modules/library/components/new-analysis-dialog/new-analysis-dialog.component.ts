import { afterNextRender, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, output, viewChild } from '@angular/core';
import { FormField, FormRoot, form } from '@angular/forms/signals';
import { formatPlural } from '@rrd-analyzer/shared';
import { ModalDialogComponent } from '../../../../shared/components/modal-dialog/modal-dialog.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { newAnalysisDraftSchema } from '../../../../stores/library/models/new-analysis-draft/new-analysis-draft';
import { LibraryStore } from '../../../../stores/library/store/library-store/library.store';
import { PendingSourceListComponent } from '../pending-source-list/pending-source-list.component';
import { SourceDropZoneComponent } from '../source-drop-zone/source-drop-zone.component';

const FORM_ID = 'new-analysis-dialog-form';
const NAME_FIELD_ID = 'new-analysis-dialog-name';

@Component({
  selector: 'app-new-analysis-dialog',
  imports: [FormField, FormRoot, ModalDialogComponent, PendingSourceListComponent, SourceDropZoneComponent],
  templateUrl: './new-analysis-dialog.component.html',
  styleUrl: './new-analysis-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewAnalysisDialogComponent {
  public readonly created = output<string>();

  private readonly _library = inject(LibraryStore);
  private readonly _nameField = viewChild.required<ElementRef<HTMLInputElement>>('nameField');
  private readonly _dropZone = viewChild.required(SourceDropZoneComponent);

  protected readonly formId = FORM_ID;
  protected readonly nameFieldId = NAME_FIELD_ID;
  protected readonly texts = inject(I18nStore).texts;
  protected readonly isDropActive = this._library.isDropActive;
  protected readonly sources = computed(() => this._library.draft().sources);

  protected readonly draftForm = form(this._library.draft, newAnalysisDraftSchema, {
    submission: {
      action: async () => await this._create(),
      onInvalid: () => this._dropZone().focus(),
    },
  });

  protected readonly isReady = computed(() => this.draftForm().valid());
  protected readonly isMissingSource = computed(() => this.draftForm.sources().touched() && this.draftForm.sources().invalid());

  protected readonly createLabel = computed(() =>
    this.draftForm().submitting() ? this.texts().newAnalysisDialog.creating : this.texts().newAnalysisDialog.create,
  );

  protected readonly hint = computed(() => {
    const dialog = this.texts().newAnalysisDialog;
    const count = this.sources().length;

    return count === 0 ? dialog.emptyHint : formatPlural(dialog.readyHint, count);
  });

  public constructor() {
    afterNextRender(() => this._nameField().nativeElement.focus());
  }

  protected close(): void {
    if (this._library.isCreating()) {
      return;
    }

    this._library.closeDialog();
  }

  protected cancel(): void {
    if (this._library.isCreating()) {
      return;
    }

    this._library.discardDraft();
  }

  protected async browse(): Promise<void> {
    await this._library.browseForSources();
  }

  protected markDropZone(isHovered: boolean): void {
    this._library.setDropActive(isHovered);
  }

  protected addDroppedFiles(files: readonly File[]): void {
    void this._library.addDroppedFiles(files);
  }

  protected removeAt(index: number): void {
    this._library.removeSourceAt(index);
  }

  protected clearAll(): void {
    this._library.clearSources();
  }

  private async _create(): Promise<void> {
    const analysis = await this._library.createAnalysis();

    if (analysis !== null) {
      this.created.emit(analysis.id);
    }
  }
}
