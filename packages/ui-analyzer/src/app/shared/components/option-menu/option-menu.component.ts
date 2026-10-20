import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { FOCUS_WITHOUT_SCROLLING } from '../../constants/focus-options';
import { GLYPHS } from '../../constants/glyphs';
import type { ValueOf } from '../../types/value-of';
import { roveFocusWithin } from '../../utils/roving-focus/roving-focus.util';

const OPTION_SELECTOR = '.option-menu-item';
const SELECTED_OPTION_SELECTOR = '.option-menu-item-selected';

export const OPTION_MENU_SIZES = {
  REGULAR: 'regular',
  COMPACT: 'compact',
} as const;

export type OptionMenuSize = ValueOf<typeof OPTION_MENU_SIZES>;

export type OptionMenuItem = {
  readonly value: string;
  readonly label: string;
};

@Component({
  selector: 'app-option-menu',
  templateUrl: './option-menu.component.html',
  styleUrl: './option-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionMenuComponent {
  public readonly items = input.required<readonly OptionMenuItem[]>();
  public readonly selected = input.required<string>();
  public readonly size = input<OptionMenuSize>(OPTION_MENU_SIZES.REGULAR);

  public readonly chosen = output<string>();

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly checkMark = GLYPHS.CHECK;
  protected readonly compactSize = OPTION_MENU_SIZES.COMPACT;

  public constructor() {
    afterNextRender(() => this._focusSelectedOption());
  }

  protected rove(event: KeyboardEvent): void {
    roveFocusWithin(this._host.nativeElement, OPTION_SELECTOR, event);
  }

  private _focusSelectedOption(): void {
    const host = this._host.nativeElement;

    (host.querySelector<HTMLElement>(SELECTED_OPTION_SELECTOR) ?? host.querySelector<HTMLElement>(OPTION_SELECTOR))?.focus(FOCUS_WITHOUT_SCROLLING);
  }
}
