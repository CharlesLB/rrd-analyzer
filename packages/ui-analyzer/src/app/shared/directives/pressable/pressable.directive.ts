import { Directive } from '@angular/core';

const ACTIVATION_KEYS = ['Enter', ' ', 'Spacebar'];

@Directive({
  selector: '[appPressable]',
  host: {
    role: 'button',
    tabindex: '0',
    '(keydown)': 'pressOnActivationKey($event)',
  },
})
export class PressableDirective {
  protected pressOnActivationKey(event: KeyboardEvent): void {
    if (!ACTIVATION_KEYS.includes(event.key) || !(event.target instanceof HTMLElement) || event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    event.target.click();
  }
}
