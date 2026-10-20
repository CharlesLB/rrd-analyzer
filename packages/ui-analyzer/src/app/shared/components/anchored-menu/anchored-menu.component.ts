import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, DOCUMENT, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { FOCUS_WITHOUT_SCROLLING } from '../../constants/focus-options';
import type { PopoverPlacement } from '../../utils/anchored-popover/anchored-popover.util';
import { roveFocusWithin } from '../../utils/roving-focus/roving-focus.util';

const CLOSE_KEY = 'Escape';
const MENU_STOP_SELECTOR = 'button:not([disabled])';
const TEXT_ENTRY_SELECTOR = 'input, textarea, select';

@Component({
  selector: 'app-anchored-menu',
  templateUrl: './anchored-menu.component.html',
  styleUrl: './anchored-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'closeRequested.emit()' },
})
export class AnchoredMenuComponent {
  public readonly placement = input.required<PopoverPlacement>();
  public readonly width = input.required<number>();

  public readonly closeRequested = output<void>();

  private readonly _document = inject(DOCUMENT);
  private readonly _menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  private readonly _opener = this._document.activeElement;

  public constructor() {
    afterNextRender(() => this._takeFocus());
    inject(DestroyRef).onDestroy(() => this._returnFocusToOpener());
  }

  protected handleKey(event: KeyboardEvent): void {
    if (event.key === CLOSE_KEY) {
      event.preventDefault();
      event.stopPropagation();
      this.closeRequested.emit();

      return;
    }

    if (!(event.target instanceof Element) || event.target.matches(TEXT_ENTRY_SELECTOR)) {
      return;
    }

    roveFocusWithin(this._menu().nativeElement, MENU_STOP_SELECTOR, event);
  }

  private _takeFocus(): void {
    const menu = this._menu().nativeElement;

    if (!menu.contains(this._document.activeElement)) {
      menu.focus(FOCUS_WITHOUT_SCROLLING);
    }
  }

  private _returnFocusToOpener(): void {
    const focused = this._document.activeElement;
    const isFocusLeftNowhere = focused === null || focused === this._document.body;

    if (isFocusLeftNowhere && this._opener instanceof HTMLElement && this._opener.isConnected) {
      this._opener.focus();
    }
  }
}
