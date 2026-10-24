import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countOf,
  elementOf,
  elementsOf,
  renderWithInputs,
  textOf,
  textsOf,
  typeInto,
} from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { jsonLinesOf } from '../../models/json-lines/json-lines';
import { searchedLinesOf, searchMatchesOf } from '../../models/json-search/json-search';
import { JsonViewerComponent } from './json-viewer.component';

const LINES = jsonLinesOf({ service: 'atlas-api', status: 503, retried: true, user: null });

const renderViewer = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(JsonViewerComponent, {
    lines: searchedLinesOf(LINES, [], 0),
    entryKey: 0,
    isSearchOpen: false,
    matchCounter: '',
    hasNoResults: false,
    focusRequests: 0,
    previousMatchTip: 'previous match (Shift+Enter)',
    query: '',
    queryHistory: [],
    ...inputs,
  });

const boundsOf = (top: number, height: number): DOMRect => ({
  left: 0,
  top,
  width: 400,
  height,
  right: 400,
  bottom: top + height,
  x: 0,
  y: top,
  toJSON: () => '',
});

const VIEW_BOUNDS = boundsOf(0, 300);

const placeCurrentMatchAt = (top: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function boundsOfElement(this: HTMLElement): DOMRect {
    return this.classList.contains('json-viewer-hit-current') ? boundsOf(top, 20) : VIEW_BOUNDS;
  });

const searching = (query: string, current = 0) => ({
  lines: searchedLinesOf(LINES, searchMatchesOf(LINES, query), current),
  isSearchOpen: true,
  query,
  focusRequests: 1,
});

describe('JsonViewerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('numbers the lines and prints the object as it was written, indentation included', () => {
    const fixture = renderViewer();

    expect(textsOf(fixture, '.json-viewer-number')).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(elementsOf(fixture, '.json-viewer-text').map((line) => line.textContent)).toEqual([
      '{',
      '  "service": "atlas-api",',
      '  "status": 503,',
      '  "retried": true,',
      '  "user": null',
      '}',
    ]);
  });

  it('colours keys, strings, numbers, booleans, null and punctuation apart', () => {
    const fixture = renderViewer();

    expect(textOf(fixture, '.json-viewer-token-key')).toBe('"service"');
    expect(textOf(fixture, '.json-viewer-token-string')).toBe('"atlas-api"');
    expect(textOf(fixture, '.json-viewer-token-number')).toBe('503');
    expect(textOf(fixture, '.json-viewer-token-boolean')).toBe('true');
    expect(textOf(fixture, '.json-viewer-token-null')).toBe('null');
    expect(textOf(fixture, '.json-viewer-token-punctuation')).toBe('{');
  });

  it('shows no search bar until the search is open, then focuses the field and makes room for the bar', async () => {
    const fixture = renderViewer();

    expect(elementOf(fixture, '.json-viewer-search')).toBeNull();

    fixture.componentRef.setInput('isSearchOpen', true);
    fixture.componentRef.setInput('focusRequests', 1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(elementOf(fixture, '.json-viewer-search-field input'));
    expect(elementOf(fixture, '.json-viewer-lines-searching')).not.toBeNull();
  });

  it('highlights every match softly and the current one solidly', () => {
    const fixture = renderViewer({ ...searching('e', 1), matchCounter: '2 of 6' });

    expect(countOf(fixture, '.json-viewer-hit')).toBe(6);
    expect(countOf(fixture, '.json-viewer-hit-current')).toBe(1);
    expect(textOf(fixture, '.json-viewer-search-counter')).toBe('2 of 6');
  });

  it('with no match, says so in the counter and flags the field', () => {
    const fixture = renderViewer({ ...searching('kafka'), matchCounter: 'No results', hasNoResults: true });

    expect(textOf(fixture, '.json-viewer-search-counter-empty')).toBe('No results');
    expect(elementOf(fixture, '.search-field-input-matches-nothing')).not.toBeNull();
  });

  it('reports what is typed in the field', () => {
    const fixture = renderViewer(searching(''));
    const typed = vi.fn();
    fixture.componentInstance.query.subscribe(typed);

    typeInto(fixture, '.json-viewer-search-field input', 'atlas');

    expect(typed).toHaveBeenCalledWith('atlas');
  });

  it('steps to the next match on Enter or F3, to the previous with Shift, and closes on Escape, without the keys reaching the page', () => {
    const fixture = renderViewer(searching('e'));
    const stepped = vi.fn();
    const closed = vi.fn();
    const reachedThePage = vi.fn();
    fixture.componentInstance.matchStepped.subscribe(stepped);
    fixture.componentInstance.searchClosed.subscribe(closed);
    document.addEventListener('keydown', reachedThePage);
    const field = elementOf(fixture, '.json-viewer-search-field input');

    const press = (key: string, shiftKey = false): boolean =>
      field?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })) ?? true;

    press('Enter');
    press('Enter', true);
    press('F3');
    press('F3', true);
    press('Escape');
    press('a');
    document.removeEventListener('keydown', reachedThePage);

    expect(stepped.mock.calls).toEqual([[1], [-1], [1], [-1]]);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(reachedThePage).toHaveBeenCalledTimes(1);
  });

  it('remembers the query stepped through, and closes the recent searches on Escape before the search itself', () => {
    const fixture = renderViewer({ ...searching('atlas'), queryHistory: ['status', 'atlas'] });
    const committed = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.queryCommitted.subscribe(committed);
    fixture.componentInstance.searchClosed.subscribe(closed);
    const field = elementOf(fixture, '.json-viewer-search-field input');

    const press = (key: string): void => {
      field?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };

    press('Enter');
    typeInto(fixture, '.json-viewer-search-field input', 'stat');
    fixture.detectChanges();
    press('Escape');

    expect(committed).toHaveBeenCalledWith('atlas');
    expect(closed).not.toHaveBeenCalled();

    press('Escape');

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('steps and closes from the buttons of the bar, each named for a screen reader', () => {
    const fixture = renderViewer(searching('e'));
    const stepped = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.matchStepped.subscribe(stepped);
    fixture.componentInstance.searchClosed.subscribe(closed);
    const [previous, next] = elementsOf(fixture, '.json-viewer-search-step');

    previous?.click();
    next?.click();
    elementOf(fixture, '.json-viewer-search-close')?.click();

    expect(previous?.getAttribute('aria-label')).toBe('previous match (Shift+Enter)');
    expect(next?.getAttribute('aria-label')).toBe('next match (Enter)');
    expect(elementOf(fixture, '.json-viewer-search-close')?.getAttribute('aria-label')).toBe('close (Esc)');
    expect(stepped.mock.calls).toEqual([[-1], [1]]);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('scrolls back to the top when another entry is shown without a search', async () => {
    const fixture = renderViewer();
    await fixture.whenStable();
    const scroller = elementOf(fixture, '.json-viewer-lines') as HTMLElement;
    scroller.scrollTop = 120;

    fixture.componentRef.setInput('entryKey', 1);
    fixture.componentRef.setInput('lines', searchedLinesOf(jsonLinesOf({ other: true }), [], 0));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scroller.scrollTop).toBe(0);
  });

  it('JsonViewerComponent leaves a current match that is already in view where it is, and brings one below the view up to its middle', async () => {
    const placement = placeCurrentMatchAt(100);
    const fixture = renderViewer(searching('e', 1));
    await fixture.whenStable();
    const scroller = elementOf(fixture, '.json-viewer-lines');

    expect(scroller?.scrollTop).toBe(0);

    placement.mockImplementation(function boundsBelowTheView(this: HTMLElement): DOMRect {
      return this.classList.contains('json-viewer-hit-current') ? boundsOf(400, 20) : VIEW_BOUNDS;
    });
    fixture.componentRef.setInput('lines', searchedLinesOf(LINES, searchMatchesOf(LINES, 'e'), 2));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scroller?.scrollTop).toBe(250);
  });

  it('JsonViewerComponent, compiled again from its own metadata as a TestBed override compiles it, still focuses the field and keeps the lines in view', async () => {
    TestBed.overrideComponent(JsonViewerComponent, { set: {} });
    await TestBed.compileComponents();
    const fixture = renderViewer(searching('e'));
    await fixture.whenStable();

    expect(document.activeElement).toBe(elementOf(fixture, '.json-viewer-search-field input'));
    expect(elementOf(fixture, '.json-viewer-lines')?.scrollTop).toBe(0);
  });
});
