import { ChangeDetectionStrategy, Component, type ElementRef, inject, input, output, viewChild } from '@angular/core';
import { PressableDirective } from '../../../../shared/directives/pressable/pressable.directive';
import { hasLeftTarget } from '../../../../shared/utils/drag-transfer/drag-transfer.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-source-drop-zone',
  imports: [PressableDirective],
  templateUrl: './source-drop-zone.component.html',
  styleUrl: './source-drop-zone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceDropZoneComponent {
  public readonly isActive = input.required<boolean>();

  public readonly browseRequested = output<void>();
  public readonly hoverChanged = output<boolean>();
  public readonly filesDropped = output<readonly File[]>();

  private readonly _zone = viewChild.required<ElementRef<HTMLElement>>('zone');

  protected readonly texts = inject(I18nStore).texts;

  public focus(): void {
    this._zone().nativeElement.focus();
  }

  protected highlight(): void {
    this.hoverChanged.emit(true);
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected clearHighlight(event: DragEvent): void {
    event.preventDefault();

    if (hasLeftTarget(event)) {
      this.hoverChanged.emit(false);
    }
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.hoverChanged.emit(false);
    this.filesDropped.emit(Array.from(event.dataTransfer?.files ?? []));
  }
}
