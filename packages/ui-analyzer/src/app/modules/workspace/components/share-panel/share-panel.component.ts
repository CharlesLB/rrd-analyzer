import { afterNextRender, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import { ModalDialogComponent } from '../../../../shared/components/modal-dialog/modal-dialog.component';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { LiveSession } from '../../../../stores/sharing/models/live-session/live-session';

type SharedEntry = {
  readonly name: string;
  readonly tip: string;
  readonly isOnline: boolean;
  readonly stateLabel: string;
  readonly stateTip: string;
};

type SharedGroup = {
  readonly label: string;
  readonly entries: readonly SharedEntry[];
};

const LINK_FIELD_ID = 'share-panel-link';

@Component({
  selector: 'app-share-panel',
  imports: [ModalDialogComponent],
  templateUrl: './share-panel.component.html',
  styleUrl: './share-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharePanelComponent {
  public readonly session = input.required<LiveSession>();
  public readonly minutesLeft = input.required<number>();
  public readonly isBusy = input.required<boolean>();

  public readonly copyRequested = output<void>();
  public readonly endRequested = output<void>();
  public readonly closed = output<void>();

  private readonly _linkField = viewChild.required<ElementRef<HTMLInputElement>>('linkField');

  protected readonly linkFieldId = LINK_FIELD_ID;
  protected readonly texts = inject(I18nStore).texts;

  protected readonly expiry = computed(() => formatPlural(this.texts().sharing.panel.expiry, this.minutesLeft()));
  protected readonly endLabel = computed(() => (this.isBusy() ? this.texts().sharing.panel.ending : this.texts().sharing.panel.end));

  protected readonly groups = computed<readonly SharedGroup[]>(() => {
    const panel = this.texts().sharing.panel;
    const { files, log } = this.session();

    const entryOf = (name: string, tip: string, isOnline: boolean): SharedEntry => ({
      name,
      tip,
      isOnline,
      stateLabel: isOnline ? panel.online : panel.local,
      stateTip: isOnline ? panel.onlineTip : panel.localTip,
    });

    const fileGroup: SharedGroup = { label: panel.filesLabel, entries: files.map((file) => entryOf(file.name, file.path || file.name, file.isOnline)) };

    return log === null ? [fileGroup] : [fileGroup, { label: panel.logLabel, entries: [entryOf(log.name, log.name, log.isOnline)] }];
  });

  public constructor() {
    afterNextRender(() => {
      const linkField = this._linkField().nativeElement;

      linkField.focus();
      linkField.select();
    });
  }
}
