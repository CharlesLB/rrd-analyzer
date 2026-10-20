import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import { SEARCH_FIELD_SIZES, SearchFieldComponent } from '../../../../shared/components/search-field/search-field.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { ContextMenuRequest } from '../../../../stores/workspace/models/context-menu/context-menu';
import type { LibraryEntry } from '../../../../stores/workspace/models/series/series.model';
import { LibraryThumbnailComponent } from '../library-thumbnail/library-thumbnail.component';

const NO_FILTER = '';

@Component({
  selector: 'app-chart-library',
  imports: [LibraryThumbnailComponent, SearchFieldComponent],
  templateUrl: './chart-library.component.html',
  styleUrl: './chart-library.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartLibraryComponent {
  public readonly entries = input.required<readonly LibraryEntry[]>();
  public readonly totalCount = input.required<number>();
  public readonly filter = input.required<string>();
  public readonly filterHistory = input.required<readonly string[]>();
  public readonly isCollapsed = input.required<boolean>();
  public readonly showsAreaFill = input.required<boolean>();

  public readonly filterChanged = output<string>();
  public readonly filterCommitted = output<string>();
  public readonly filterForgotten = output<string>();
  public readonly collapseToggled = output<void>();
  public readonly opened = output<string>();
  public readonly contextMenuRequested = output<ContextMenuRequest>();
  public readonly dragStarted = output<string>();
  public readonly dragEnded = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly searchFieldSize = SEARCH_FIELD_SIZES.ROOMY;

  protected readonly countLabel = computed(() => formatMessage(this.texts().chartLibrary.count, { shown: this.entries().length, total: this.totalCount() }));

  protected clearOrLeaveFilter(event: Event): void {
    if (this.filter() !== NO_FILTER) {
      this.filterChanged.emit(NO_FILTER);

      return;
    }

    if (event.target instanceof HTMLElement) {
      event.target.blur();
    }
  }
}
