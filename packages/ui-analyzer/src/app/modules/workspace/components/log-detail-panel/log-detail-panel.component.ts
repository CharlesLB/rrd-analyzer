import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { formatMessage, formatPlural } from '@rrd-analyzer/shared';
import { SearchIconComponent } from '../../../../shared/components/icons/search-icon/search-icon.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { copyText } from '../../../../shared/utils/clipboard-text/clipboard-text.util';
import { formatCount } from '../../../../shared/utils/count-format/count-format.util';
import { formatTimestampWithSeconds } from '../../../../shared/utils/date-format/date-format.util';
import { useSettlingSignal } from '../../../../shared/utils/settling-signal/settling-signal.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { LOG_ROLES, type LogMapping } from '../../../../stores/logs/models/log-mapping/log-mapping';
import { STEP_DIRECTIONS, type StepDirection } from '../../../../stores/logs/models/log-state/log-state';
import type { LogEntry } from '../../../../stores/logs/models/log-timeline/log-timeline';
import type { EntryPosition } from '../../../../stores/logs/store/logs-store/logs.store';
import { SEARCH_FIELDS } from '../../../../stores/search-history/models/search-field/search-field';
import { SearchHistoryStore } from '../../../../stores/search-history/store/search-history-store/search-history.store';
import { ToastStore } from '../../../../stores/toast/store/toast-store/toast.store';
import { FocusScopeDirective } from '../../directives/focus-scope/focus-scope.directive';
import { jsonLinesOf } from '../../models/json-lines/json-lines';
import { searchedLinesOf, searchMatchesOf, wrappedMatchIndex } from '../../models/json-search/json-search';
import { JsonViewerComponent } from '../json-viewer/json-viewer.component';
import { SidePanelComponent } from '../side-panel/side-panel.component';

const COPIED_MILLISECONDS = 1600;
const SEARCH_SETTLE_MILLISECONDS = 120;
const JSON_INDENT = 2;
const NO_QUERY = '';
const FIRST_MATCH = 0;

type DetailShortcutLabels = {
  readonly find: string;
  readonly previousMatch: string;
};

const PANEL_WIDTH = 404;

@Component({
  selector: 'app-log-detail-panel',
  imports: [FocusScopeDirective, JsonViewerComponent, SearchIconComponent, SidePanelComponent],
  templateUrl: './log-detail-panel.component.html',
  styleUrl: './log-detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogDetailPanelComponent {
  public readonly entry = input.required<LogEntry>();
  public readonly color = input.required<string>();
  public readonly position = input.required<EntryPosition | null>();
  public readonly canStepBackward = input.required<boolean>();
  public readonly canStepForward = input.required<boolean>();
  public readonly mapping = input.required<LogMapping>();
  public readonly shortcutLabels = input.required<DetailShortcutLabels>();

  public readonly closeRequested = output<void>();
  public readonly stepRequested = output<StepDirection>();
  public readonly centerRequested = output<void>();

  private readonly _toasts = inject(ToastStore);
  private readonly _searchHistory = inject(SearchHistoryStore);
  private readonly _isSearchOpenState = signal(false);
  private readonly _focusRequestsState = signal(0);
  private readonly _copied = useSettlingSignal(false, COPIED_MILLISECONDS);
  private readonly _sought = useSettlingSignal(NO_QUERY, SEARCH_SETTLE_MILLISECONDS);

  public readonly isSearchOpen = this._isSearchOpenState.asReadonly();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly panelWidth = PANEL_WIDTH;
  protected readonly glyphs = GLYPHS;
  protected readonly directions = STEP_DIRECTIONS;
  protected readonly query = signal(NO_QUERY);
  protected readonly focusRequests = this._focusRequestsState.asReadonly();
  protected readonly queryHistory = computed(() => this._searchHistory.histories()[SEARCH_FIELDS.LOG_DETAIL]);
  protected readonly isCopied = this._copied.value;

  private readonly _lines = computed(() => jsonLinesOf(this.entry().record));
  private readonly _unsearchedLines = computed(() => searchedLinesOf(this._lines(), [], FIRST_MATCH));
  private readonly _matches = computed(() => (this._isSearchOpenState() ? searchMatchesOf(this._lines(), this._sought.value()) : []));

  private readonly _currentMatchState = linkedSignal({
    source: () => ({ entryIndex: this.entry().index, query: this._sought.value() }),
    computation: () => FIRST_MATCH,
  });

  protected readonly time = computed(() => formatTimestampWithSeconds(this.entry().timeMilliseconds));
  protected readonly searchedLines = computed(() => searchedLinesOf(this._lines(), this._matches(), this._currentMatchState(), this._unsearchedLines()));
  protected readonly lineCount = computed(() => formatPlural(this.texts().logs.detail.lineCount, this._lines().length));
  protected readonly hasNoResults = computed(() => this._isSearchOpenState() && this._sought.value() !== NO_QUERY && this._matches().length === 0);

  protected readonly positionLabel = computed(() => {
    const position = this.position();

    return position === null || position.position < 0
      ? ''
      : formatMessage(this.texts().logs.detail.position, { position: formatCount(position.position + 1), total: formatCount(position.total) });
  });

  protected readonly mappedRoles = computed(() => {
    const detail = this.texts().logs.detail;
    const mapping = this.mapping();

    return [
      { label: detail.timestampRole, path: mapping[LOG_ROLES.TIMESTAMP] },
      { label: detail.typeRole, path: mapping[LOG_ROLES.TYPE] },
      { label: detail.messageRole, path: mapping[LOG_ROLES.MESSAGE] },
    ];
  });

  protected readonly findTip = computed(() => formatMessage(this.texts().logs.detail.findTip, { shortcut: this.shortcutLabels().find }));
  protected readonly shortcutsHint = computed(() => formatMessage(this.texts().logs.detail.shortcuts, this.shortcutLabels()));

  protected readonly previousMatchTip = computed(() =>
    formatMessage(this.texts().logs.detail.previousMatch, { shortcut: this.shortcutLabels().previousMatch }),
  );

  protected readonly matchCounter = computed(() => {
    const detail = this.texts().logs.detail;
    const total = this._matches().length;

    if (this._sought.value() === NO_QUERY) {
      return '';
    }

    return total === 0 ? detail.noResults : formatMessage(detail.matchPosition, { current: this._currentMatchState() + 1, total });
  });

  public openSearch(): void {
    void this._searchHistory.load(SEARCH_FIELDS.LOG_DETAIL);
    this._isSearchOpenState.set(true);
    this._focusRequestsState.update((requests) => requests + 1);
  }

  public closeSearch(): void {
    this._isSearchOpenState.set(false);
    this.query.set(NO_QUERY);
    this._sought.set(NO_QUERY);
  }

  public stepMatch(direction: StepDirection): void {
    this._currentMatchState.update((current) => wrappedMatchIndex(current, direction, this._matches().length));
  }

  protected typeQuery(text: string): void {
    this.query.set(text);
    this._sought.settle(text);
  }

  protected rememberQuery(term: string): void {
    void this._searchHistory.remember(SEARCH_FIELDS.LOG_DETAIL, term);
  }

  protected forgetQuery(term: string): void {
    void this._searchHistory.forget(SEARCH_FIELDS.LOG_DETAIL, term);
  }

  protected toggleSearch(): void {
    if (this._isSearchOpenState()) {
      this.closeSearch();

      return;
    }

    this.openSearch();
  }

  protected async copyJson(): Promise<void> {
    const isCopied = await copyText(JSON.stringify(this.entry().record, null, JSON_INDENT));

    if (!isCopied) {
      this._toasts.show(this.texts().logs.detail.copyBlocked);

      return;
    }

    this._copied.set(true);
    this._copied.settle(false);
  }
}
