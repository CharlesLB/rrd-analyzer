import { ChangeDetectionStrategy, Component, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';
import { GLYPHS } from '../../constants/glyphs';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'dismissUnlessOnAction($event)' },
})
export class ToastComponent {
  public readonly message = input.required<string | null>();
  public readonly actionLabel = input<string | null>(null);

  public readonly actionChosen = output<void>();
  public readonly dismissed = output<void>();
  public readonly held = output<void>();
  public readonly released = output<void>();

  private readonly _action = viewChild<ElementRef<HTMLButtonElement>>('action');

  protected readonly texts = inject(I18nStore).texts;
  protected readonly closeGlyph = GLYPHS.CLOSE;

  protected dismissUnlessOnAction(event: PointerEvent): void {
    const isOnAction = event.target instanceof Node && (this._action()?.nativeElement.contains(event.target) ?? false);

    if (this.message() !== null && !isOnAction) {
      this.dismissed.emit();
    }
  }
}
