import { afterNextRender, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { DismissOnScrimDirective } from '../../../../shared/directives/dismiss-on-scrim/dismiss-on-scrim.directive';
import { FocusTrapDirective } from '../../../../shared/directives/focus-trap/focus-trap.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { type LiveSession, minutesLeftOf } from '../../../../stores/sharing/models/live-session/live-session';

const PANEL_TITLE_ID = 'share-panel-title';
const LINK_FIELD_ID = 'share-panel-link';

@Component({
  selector: 'app-share-panel',
  imports: [DismissOnScrimDirective, FocusTrapDirective],
  templateUrl: './share-panel.component.html',
  styleUrl: './share-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class SharePanelComponent {
  public readonly session = input.required<LiveSession>();
  public readonly nowMilliseconds = input.required<number>();
  public readonly isBusy = input.required<boolean>();

  public readonly copyRequested = output<void>();
  public readonly endRequested = output<void>();
  public readonly closed = output<void>();

  private readonly _linkField = viewChild.required<ElementRef<HTMLInputElement>>('linkField');

  protected readonly titleId = PANEL_TITLE_ID;
  protected readonly linkFieldId = LINK_FIELD_ID;
  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;

  protected readonly expiry = computed(() =>
    formatPlural(this.texts().sharing.panel.expiry, minutesLeftOf(this.session().expiresAtMilliseconds, this.nowMilliseconds())),
  );
  protected readonly endLabel = computed(() => (this.isBusy() ? this.texts().sharing.panel.ending : this.texts().sharing.panel.end));

  public constructor() {
    afterNextRender(() => {
      const linkField = this._linkField().nativeElement;

      linkField.focus();
      linkField.select();
    });
  }
}
