import { Directive, output } from '@angular/core';

@Directive({
  selector: '[appDismissOnScrim]',
  host: {
    '(pointerdown)': 'notePress($event)',
    '(click)': 'dismissWhenPressedAndReleasedHere($event)',
  },
})
export class DismissOnScrimDirective {
  public readonly dismissed = output<void>();

  private readonly _press = { startedHere: false };

  protected notePress(event: PointerEvent): void {
    this._press.startedHere = event.target === event.currentTarget;
  }

  protected dismissWhenPressedAndReleasedHere(event: MouseEvent): void {
    if (this._press.startedHere && event.target === event.currentTarget) {
      this.dismissed.emit();
    }
  }
}
