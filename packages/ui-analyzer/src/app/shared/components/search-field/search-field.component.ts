import { ChangeDetectionStrategy, Component, computed, type ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import { I18nStore } from '../../../stores/i18n/store/i18n-store/i18n.store';
import { GLYPHS } from '../../constants/glyphs';
import type { ValueOf } from '../../types/value-of';
import { inputValueOf } from '../../utils/input-value/input-value.util';
import { SUGGESTION_STEPS, type SuggestionStep, steppedSuggestion, suggestionsOf } from '../../utils/search-suggestions/search-suggestions.util';

export const SEARCH_FIELD_SIZES = {
  COMPACT: 'compact',
  REGULAR: 'regular',
  ROOMY: 'roomy',
} as const;

type SearchFieldSize = ValueOf<typeof SEARCH_FIELD_SIZES>;

const SEARCH_FIELD_KEYS = {
  NEXT: 'ArrowDown',
  PREVIOUS: 'ArrowUp',
  CONFIRM: 'Enter',
  DISMISS: 'Escape',
} as const;

type SearchFieldKey = ValueOf<typeof SEARCH_FIELD_KEYS>;

const NO_VALUE = '';
const HISTORY_LIST_ID_PREFIX = 'search-field-history-';
const listIdSequence = { lastIssuedNumber: 0 };

const isSearchFieldKey = (key: string): key is SearchFieldKey => Object.values<string>(SEARCH_FIELD_KEYS).includes(key);

type HistoryOption = {
  readonly term: string;
  readonly id: string;
  readonly isHighlighted: boolean;
};

@Component({
  selector: 'app-search-field',
  templateUrl: './search-field.component.html',
  styleUrl: './search-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFieldComponent {
  public readonly value = model.required<string>();
  public readonly placeholder = input.required<string>();
  public readonly history = input<readonly string[]>([]);
  public readonly size = input<SearchFieldSize>(SEARCH_FIELD_SIZES.REGULAR);
  public readonly isMonospace = input(false);
  public readonly matchesNothing = input(false);

  public readonly committed = output<string>();
  public readonly forgotten = output<string>();

  private readonly _field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly _isListOpenState = signal(false);
  private readonly _highlightedState = signal<number | null>(null);
  private readonly _suggestions = computed(() => suggestionsOf(this.history(), this.value()));
  private readonly _keyHandlers: Readonly<Record<SearchFieldKey, () => boolean>> = {
    [SEARCH_FIELD_KEYS.NEXT]: () => this._step(SUGGESTION_STEPS.NEXT),
    [SEARCH_FIELD_KEYS.PREVIOUS]: () => this.isListShown() && this._step(SUGGESTION_STEPS.PREVIOUS),
    [SEARCH_FIELD_KEYS.CONFIRM]: () => this._confirm(),
    [SEARCH_FIELD_KEYS.DISMISS]: () => this._dismiss(),
  };

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;
  protected readonly sizes = SEARCH_FIELD_SIZES;
  protected readonly listId = `${HISTORY_LIST_ID_PREFIX}${++listIdSequence.lastIssuedNumber}`;
  protected readonly hasValue = computed(() => this.value() !== NO_VALUE);
  protected readonly isListShown = computed(() => this._isListOpenState() && this._suggestions().length > 0);
  protected readonly options = computed<readonly HistoryOption[]>(() =>
    this._suggestions().map((term, index) => ({ term, id: `${this.listId}-${index}`, isHighlighted: index === this._highlightedState() })),
  );
  protected readonly activeOptionId = computed(() => (this.isListShown() ? (this.options().find((option) => option.isHighlighted)?.id ?? null) : null));

  public focusAndSelect(): void {
    const field = this._field().nativeElement;

    field.focus();
    field.select();
  }

  protected type(event: Event): void {
    this.value.set(inputValueOf(event));
    this._highlightedState.set(null);
    this._isListOpenState.set(true);
  }

  protected openList(): void {
    this._isListOpenState.set(true);
  }

  protected leave(): void {
    this._closeList();
    this._commit(this.value());
  }

  protected clear(): void {
    this.value.set(NO_VALUE);
    this._highlightedState.set(null);
    this._isListOpenState.set(true);
    this._field().nativeElement.focus();
  }

  protected keepFocus(event: MouseEvent): void {
    event.preventDefault();
  }

  protected respondToKey(event: KeyboardEvent): void {
    if (!isSearchFieldKey(event.key) || !this._keyHandlers[event.key]()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  protected pick(term: string): void {
    this.value.set(term);
    this._closeList();
    this._commit(term);
  }

  protected forget(term: string, event: MouseEvent): void {
    event.stopPropagation();
    this._highlightedState.set(null);
    this.forgotten.emit(term);
  }

  private _step(step: SuggestionStep): boolean {
    const suggestionCount = this._suggestions().length;

    if (suggestionCount === 0) {
      return false;
    }

    this._isListOpenState.set(true);
    this._highlightedState.update((highlighted) => steppedSuggestion(suggestionCount, highlighted, step));

    return true;
  }

  private _confirm(): boolean {
    const highlighted = this.options().find((option) => option.isHighlighted);

    if (this.isListShown() && highlighted !== undefined) {
      this.pick(highlighted.term);

      return true;
    }

    this._closeList();
    this._commit(this.value());

    return false;
  }

  private _dismiss(): boolean {
    if (!this.isListShown()) {
      return false;
    }

    this._closeList();

    return true;
  }

  private _closeList(): void {
    this._isListOpenState.set(false);
    this._highlightedState.set(null);
  }

  private _commit(term: string): void {
    const trimmed = term.trim();

    if (trimmed !== NO_VALUE) {
      this.committed.emit(trimmed);
    }
  }
}
