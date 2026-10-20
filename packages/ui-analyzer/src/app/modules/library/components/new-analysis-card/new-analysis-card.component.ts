import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { PressableDirective } from '../../../../shared/directives/pressable/pressable.directive';
import { hasLeftTarget } from '../../../../shared/utils/drag-transfer/drag-transfer.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';

@Component({
  selector: 'app-new-analysis-card',
  imports: [PressableDirective],
  templateUrl: './new-analysis-card.component.html',
  styleUrl: './new-analysis-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewAnalysisCardComponent {
  public readonly startRequested = output<void>();
  public readonly filesDropped = output<readonly File[]>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyph = GLYPHS.NEW;
  protected readonly isDropTarget = signal(false);

  protected markAsDropTarget(): void {
    this.isDropTarget.set(true);
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected clearDropTarget(event: DragEvent): void {
    if (hasLeftTarget(event)) {
      this.isDropTarget.set(false);
    }
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.isDropTarget.set(false);
    this.filesDropped.emit(Array.from(event.dataTransfer?.files ?? []));
  }
}
