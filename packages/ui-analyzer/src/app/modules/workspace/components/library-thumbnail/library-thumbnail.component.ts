import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { PressableDirective } from '../../../../shared/directives/pressable/pressable.directive';
import { DRAG_EFFECTS, startDragTransfer } from '../../../../shared/utils/drag-transfer/drag-transfer.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { type ContextMenuRequest, pointerPositionOf } from '../../../../stores/workspace/models/context-menu/context-menu';
import type { LibraryEntry } from '../../../../stores/workspace/models/series/series.model';
import { SparklineComponent } from '../sparkline/sparkline.component';

@Component({
  selector: 'app-library-thumbnail',
  imports: [SparklineComponent, PressableDirective],
  templateUrl: './library-thumbnail.component.html',
  styleUrl: './library-thumbnail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryThumbnailComponent {
  public readonly entry = input.required<LibraryEntry>();
  public readonly showsAreaFill = input.required<boolean>();

  public readonly opened = output<string>();
  public readonly contextMenuRequested = output<ContextMenuRequest>();
  public readonly dragStarted = output<string>();
  public readonly dragEnded = output<void>();

  private readonly _texts = inject(I18nStore).texts;

  protected readonly tip = computed(() => {
    const { series, isOnCanvas } = this.entry();

    return isOnCanvas ? formatMessage(this._texts().chartLibrary.onCanvasTip, { file: series.file }) : series.file;
  });

  protected openContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenuRequested.emit({ seriesId: this.entry().series.id, ...pointerPositionOf(event) });
  }

  protected startDrag(event: DragEvent): void {
    startDragTransfer(event, this.entry().series.id, DRAG_EFFECTS.COPY_MOVE);
    this.dragStarted.emit(this.entry().series.id);
  }
}
