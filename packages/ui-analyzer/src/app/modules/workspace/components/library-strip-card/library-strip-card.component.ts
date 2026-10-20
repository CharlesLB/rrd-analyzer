import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { PressableDirective } from '../../../../shared/directives/pressable/pressable.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { type ContextMenuRequest, pointerPositionOf } from '../../../../stores/workspace/models/context-menu/context-menu';
import type { LibraryEntry } from '../../../../stores/workspace/models/series/series.model';
import { SparklineComponent } from '../sparkline/sparkline.component';

@Component({
  selector: 'app-library-strip-card',
  imports: [PressableDirective, SparklineComponent],
  templateUrl: './library-strip-card.component.html',
  styleUrl: './library-strip-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryStripCardComponent {
  public readonly entry = input.required<LibraryEntry>();
  public readonly showsAreaFill = input.required<boolean>();

  public readonly opened = output<string>();
  public readonly contextMenuRequested = output<ContextMenuRequest>();
  public readonly canvasToggled = output<string>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly mark = computed(() => (this.entry().isOnCanvas ? GLYPHS.CHECK : GLYPHS.ADD));

  protected openContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.contextMenuRequested.emit({ seriesId: this.entry().series.id, ...pointerPositionOf(event) });
  }

  protected toggleCanvas(event: Event): void {
    event.stopPropagation();
    this.canvasToggled.emit(this.entry().series.id);
  }
}
