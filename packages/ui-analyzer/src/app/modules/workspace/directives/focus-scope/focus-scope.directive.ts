import { afterNextRender, DestroyRef, Directive, DOCUMENT, ElementRef, inject } from '@angular/core';
import { FOCUS_WITHOUT_SCROLLING } from '../../../../shared/constants/focus-options';

const NO_OUTLINE = 'none';

@Directive({
  selector: '[appFocusScope]',
  host: { tabindex: '-1', '[style.outline]': 'outline' },
})
export class FocusScopeDirective {
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _document = inject(DOCUMENT);
  private readonly _opener = this._document.activeElement;

  protected readonly outline = NO_OUTLINE;

  public constructor() {
    afterNextRender(() => this._takeFocus());
    inject(DestroyRef).onDestroy(() => this._returnFocusToOpener());
  }

  private _takeFocus(): void {
    const host = this._host.nativeElement;

    if (!host.contains(this._document.activeElement)) {
      host.focus(FOCUS_WITHOUT_SCROLLING);
    }
  }

  private _returnFocusToOpener(): void {
    const focused = this._document.activeElement;
    const isFocusLeftBehind = focused === null || focused === this._document.body || this._host.nativeElement.contains(focused);

    if (isFocusLeftBehind && this._opener instanceof HTMLElement && this._opener.isConnected) {
      this._opener.focus();
    }
  }
}
