import { DestroyRef, Directive, DOCUMENT, ElementRef, inject } from '@angular/core';

const TAB_KEY = 'Tab';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

@Directive({
  selector: '[appFocusTrap]',
  host: { '(document:keydown)': 'keepFocusInside($event)' },
})
export class FocusTrapDirective {
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _document = inject(DOCUMENT);
  private readonly _opener = this._document.activeElement;

  public constructor() {
    inject(DestroyRef).onDestroy(() => this._returnFocusToOpener());
  }

  protected keepFocusInside(event: KeyboardEvent): void {
    if (event.key !== TAB_KEY) {
      return;
    }

    const focusable = Array.from(this._host.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = focusable.at(0);
    const last = focusable.at(-1);
    const focused = this._document.activeElement;

    if (first === undefined || last === undefined) {
      return;
    }

    const isOutside = !this._host.nativeElement.contains(focused);
    const edge = event.shiftKey ? first : last;
    const wrapped = event.shiftKey ? last : first;

    if (isOutside || focused === edge) {
      event.preventDefault();
      wrapped.focus();
    }
  }

  private _returnFocusToOpener(): void {
    if (this._opener instanceof HTMLElement && this._opener.isConnected) {
      this._opener.focus();
    }
  }
}
