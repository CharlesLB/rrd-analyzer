import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GLYPHS } from '../../constants/glyphs';
import { DismissOnScrimDirective } from '../../directives/dismiss-on-scrim/dismiss-on-scrim.directive';
import { FocusTrapDirective } from '../../directives/focus-trap/focus-trap.directive';
import type { ValueOf } from '../../types/value-of';

export const MODAL_DIALOG_ROLES = {
  DIALOG: 'dialog',
  ALERT: 'alertdialog',
} as const;

export type ModalDialogRole = ValueOf<typeof MODAL_DIALOG_ROLES>;

const TITLE_ID_PREFIX = 'modal-dialog-title-';

const titleIdSequence = { lastIssuedNumber: 0 };

@Component({
  selector: 'app-modal-dialog',
  imports: [DismissOnScrimDirective, FocusTrapDirective],
  templateUrl: './modal-dialog.component.html',
  styleUrl: './modal-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class ModalDialogComponent {
  public readonly heading = input.required<string>();
  public readonly helper = input.required<string>();
  public readonly closeLabel = input.required<string>();
  public readonly dialogRole = input<ModalDialogRole>(MODAL_DIALOG_ROLES.DIALOG);

  public readonly closed = output<void>();

  protected readonly titleId = `${TITLE_ID_PREFIX}${++titleIdSequence.lastIssuedNumber}`;
  protected readonly glyphs = GLYPHS;
}
