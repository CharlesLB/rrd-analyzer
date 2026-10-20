import { ChangeDetectionStrategy, Component, computed, ElementRef, effect, inject, input, output, Renderer2, signal, viewChild } from '@angular/core';
import { GLYPHS } from '../../constants/glyphs';
import { OPTION_MENU_SIZES, OptionMenuComponent, type OptionMenuItem, type OptionMenuSize } from '../option-menu/option-menu.component';

const DOCUMENT_TARGET = 'document';
const PRESS_EVENT = 'pointerdown';

@Component({
  selector: 'app-option-select',
  imports: [OptionMenuComponent],
  templateUrl: './option-select.component.html',
  styleUrl: './option-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'closeOnEscape($event)' },
})
export class OptionSelectComponent {
  public readonly items = input.required<readonly OptionMenuItem[]>();
  public readonly selected = input.required<string>();
  public readonly size = input<OptionMenuSize>(OPTION_MENU_SIZES.REGULAR);

  public readonly chosen = output<string>();

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _renderer = inject(Renderer2);
  private readonly _trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly isOpen = signal(false);
  protected readonly caret = GLYPHS.CARET;
  protected readonly compactSize = OPTION_MENU_SIZES.COMPACT;
  protected readonly selectedLabel = computed(() => this.items().find((item) => item.value === this.selected())?.label ?? '');

  public constructor() {
    effect((onCleanup) => {
      if (this.isOpen()) {
        onCleanup(this._renderer.listen(DOCUMENT_TARGET, PRESS_EVENT, (event: PointerEvent) => this._closeWhenPressedOutside(event)));
      }
    });
  }

  protected toggle(): void {
    this.isOpen.update((isOpen) => !isOpen);
  }

  protected openFromKeyboard(event: Event): void {
    if (!this.isOpen()) {
      event.preventDefault();
      this.isOpen.set(true);
    }
  }

  protected closeOnEscape(event: Event): void {
    if (!this.isOpen()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this._closeBackOnTrigger();
  }

  protected choose(value: string): void {
    this._closeBackOnTrigger();
    this.chosen.emit(value);
  }

  private _closeBackOnTrigger(): void {
    this.isOpen.set(false);
    this._trigger().nativeElement.focus();
  }

  private _closeWhenPressedOutside(event: PointerEvent): void {
    if (event.target instanceof Node && !this._host.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
}
