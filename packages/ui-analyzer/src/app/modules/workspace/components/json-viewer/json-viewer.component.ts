import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, model, output, viewChild } from '@angular/core';
import * as R from 'remeda';
import { SEARCH_FIELD_SIZES, SearchFieldComponent } from '../../../../shared/components/search-field/search-field.component';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { STEP_DIRECTIONS, type StepDirection } from '../../../../stores/logs/models/log-state/log-state';
import { JSON_TOKEN_KINDS, type JsonTokenKind } from '../../models/json-lines/json-lines';
import { HIGHLIGHTS, type Highlight, type LineSegment, type SearchedLine } from '../../models/json-search/json-search';

const TOKEN_CLASSES: Readonly<Record<JsonTokenKind, string>> = {
  [JSON_TOKEN_KINDS.KEY]: 'json-viewer-token-key',
  [JSON_TOKEN_KINDS.STRING]: 'json-viewer-token-string',
  [JSON_TOKEN_KINDS.NUMBER]: 'json-viewer-token-number',
  [JSON_TOKEN_KINDS.BOOLEAN]: 'json-viewer-token-boolean',
  [JSON_TOKEN_KINDS.NULL]: 'json-viewer-token-null',
  [JSON_TOKEN_KINDS.PUNCTUATION]: 'json-viewer-token-punctuation',
};

const HIGHLIGHT_CLASSES: Readonly<Record<Highlight, string>> = {
  [HIGHLIGHTS.NONE]: '',
  [HIGHLIGHTS.MATCH]: 'json-viewer-hit',
  [HIGHLIGHTS.CURRENT]: 'json-viewer-hit json-viewer-hit-current',
};

const PLAIN_TEXT_CLASS = 'json-viewer-token-plain';
const CURRENT_HIT_SELECTOR = '.json-viewer-hit-current';
const SEARCH_BAR_ALLOWANCE = 44;
const BOTTOM_ALLOWANCE = 10;
const NEXT_MATCH_KEYS: ReadonlySet<string> = new Set(['Enter', 'F3']);
const CLOSE_KEY = 'Escape';

const classOf = (segment: LineSegment): string =>
  `${segment.kind === null ? PLAIN_TEXT_CLASS : TOKEN_CLASSES[segment.kind]} ${HIGHLIGHT_CLASSES[segment.highlight]}`.trim();

type ViewerRow = {
  readonly number: number;
  readonly segments: readonly { readonly text: string; readonly className: string }[];
};

const rowOf = (line: SearchedLine): ViewerRow => ({
  number: line.number,
  segments: R.map(line.segments, (segment) => ({ text: segment.text, className: classOf(segment) })),
});

@Component({
  selector: 'app-json-viewer',
  imports: [SearchFieldComponent],
  templateUrl: './json-viewer.component.html',
  styleUrl: './json-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonViewerComponent {
  public readonly lines = input.required<readonly SearchedLine[]>();
  public readonly entryKey = input.required<number>();
  public readonly isSearchOpen = input.required<boolean>();
  public readonly matchCounter = input.required<string>();
  public readonly hasNoResults = input.required<boolean>();
  public readonly focusRequests = input.required<number>();
  public readonly previousMatchTip = input.required<string>();
  public readonly queryHistory = input.required<readonly string[]>();
  public readonly query = model.required<string>();

  public readonly matchStepped = output<StepDirection>();
  public readonly searchClosed = output<void>();
  public readonly queryCommitted = output<string>();
  public readonly queryForgotten = output<string>();

  private readonly _scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly _searchField = viewChild(SearchFieldComponent);
  private readonly _shown: { entryKey: number | null } = { entryKey: null };

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly directions = STEP_DIRECTIONS;
  protected readonly searchFieldSize = SEARCH_FIELD_SIZES.COMPACT;

  private readonly _rowsByLine = new WeakMap<SearchedLine, ViewerRow>();

  protected readonly rows = computed(() => R.map(this.lines(), (line) => this._rowOf(line)));

  public constructor() {
    afterRenderEffect(() => {
      const field = this._searchField();

      if (this.focusRequests() > 0 && field !== undefined) {
        field.focusAndSelect();
      }
    });

    afterRenderEffect(() => {
      this.rows();
      this._keepCurrentMatchInView(this.entryKey());
    });
  }

  protected respondToKey(event: KeyboardEvent): void {
    if (NEXT_MATCH_KEYS.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      this.matchStepped.emit(event.shiftKey ? STEP_DIRECTIONS.BACKWARD : STEP_DIRECTIONS.FORWARD);

      return;
    }

    if (event.key === CLOSE_KEY) {
      event.preventDefault();
      event.stopPropagation();
      this.searchClosed.emit();
    }
  }

  private _rowOf(line: SearchedLine): ViewerRow {
    const drawn = this._rowsByLine.get(line) ?? rowOf(line);

    this._rowsByLine.set(line, drawn);

    return drawn;
  }

  private _keepCurrentMatchInView(entryKey: number): void {
    const scroller = this._scroller().nativeElement;
    const current = scroller.querySelector<HTMLElement>(CURRENT_HIT_SELECTOR);
    const hasEntryChanged = this._shown.entryKey !== entryKey;

    this._shown.entryKey = entryKey;

    if (current === null) {
      scroller.scrollTop = hasEntryChanged ? 0 : scroller.scrollTop;

      return;
    }

    const match = current.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();

    if (match.top < view.top + SEARCH_BAR_ALLOWANCE || match.bottom > view.bottom - BOTTOM_ALLOWANCE) {
      scroller.scrollTop += match.top - view.top - view.height / 2;
    }
  }
}
