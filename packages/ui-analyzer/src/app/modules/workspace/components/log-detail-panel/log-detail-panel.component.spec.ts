import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { LOG_TYPE_COLORS } from '../../../../shared/constants/colors';
import {
  countOf,
  elementOf,
  elementsOf,
  renderWithInputs,
  textOf,
  textsOf,
  typeInto,
} from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { LogEntry } from '../../../../stores/logs/models/log-timeline/log-timeline';
import { ToastStore } from '../../../../stores/toast/store/toast-store/toast.store';
import { LogDetailPanelComponent } from './log-detail-panel.component';

const RECORD = {
  '@timestamp': '2026-08-29T10:24:00.000Z',
  lvl: 'error',
  service: 'atlas-api',
  host: 'atlas-prod-02',
  event: { msg: 'Upstream 503 from atlas-store' },
};

const ENTRY: LogEntry = {
  index: 800,
  timeMilliseconds: new Date(2026, 7, 29, 7, 24, 0).getTime(),
  type: 'error',
  message: 'Upstream 503 from atlas-store',
  record: RECORD,
};

const OTHER_ENTRY: LogEntry = { ...ENTRY, index: 801, record: { service: 'atlas-store', peer: 'atlas-api' } };

const renderPanel = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(LogDetailPanelComponent, {
    entry: ENTRY,
    color: LOG_TYPE_COLORS.error,
    position: { position: 800, total: 812 },
    canStepBackward: true,
    canStepForward: true,
    mapping: { timestamp: '@timestamp', type: 'lvl', message: 'event.msg' },
    shortcutLabels: { find: 'Ctrl+F', previousMatch: 'Shift+Enter' },
    ...inputs,
  });

const SEARCH_SETTLE_MILLISECONDS = 120;

const search = (fixture: ReturnType<typeof renderPanel>, query: string): void => {
  fixture.componentInstance.openSearch();
  fixture.detectChanges();
  typeInto(fixture, '.json-viewer-search-field input', query);
  vi.advanceTimersByTime(SEARCH_SETTLE_MILLISECONDS);
  fixture.detectChanges();
};

describe('LogDetailPanelComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('heads the entry with its place among the entries shown, its type in its colour, its time to the second and its message', () => {
    const fixture = renderPanel();

    expect(textOf(fixture, '.side-panel-title')).toBe('Log entry');
    expect(textOf(fixture, '.log-detail-panel-position')).toBe('801 of 812');
    expect(textOf(fixture, '.log-detail-panel-badge-type')).toBe('error');
    expect(elementOf(fixture, '.log-detail-panel-badge')?.style.getPropertyValue('--type-color')).toBe(LOG_TYPE_COLORS.error);
    expect(textOf(fixture, '.log-detail-panel-time')).toBe('2026-08-29 07:24:00');
    expect(textOf(fixture, '.log-detail-panel-message')).toBe('Upstream 503 from atlas-store');
  });

  it('says which field each part was read from', () => {
    expect(textsOf(renderPanel(), '.log-detail-panel-role')).toEqual(['time ← @timestamp', 'type ← lvl', 'message ← event.msg']);
  });

  it('prints the complete original object, in its field order, and counts its lines', () => {
    const fixture = renderPanel();

    expect(
      elementsOf(fixture, '.json-viewer-text')
        .map((line) => line.textContent)
        .join('\n'),
    ).toBe(JSON.stringify(RECORD, null, 2));
    expect(textOf(fixture, '.log-detail-panel-lines')).toBe('9 lines');
  });

  it('for an entry of a hidden type, shows no position', () => {
    expect(textOf(renderPanel({ position: { position: -1, total: 700 } }), '.log-detail-panel-position')).toBe('');
  });

  it('asks to step to the previous or the next entry, and disables the step that has nowhere to go', () => {
    const fixture = renderPanel({ canStepForward: false });
    const stepped = vi.fn();
    fixture.componentInstance.stepRequested.subscribe(stepped);
    const [previous, next] = elementsOf(fixture, '.log-detail-panel-step') as readonly HTMLButtonElement[];

    previous?.click();
    next?.click();

    expect(previous?.getAttribute('aria-label')).toBe('previous entry (←)');
    expect(next?.disabled).toBe(true);
    expect(stepped.mock.calls).toEqual([[-1]]);
  });

  it('asks to close and to centre the charts on the entry', () => {
    const fixture = renderPanel();
    const closed = vi.fn();
    const centred = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);
    fixture.componentInstance.centerRequested.subscribe(centred);

    elementOf(fixture, '.side-panel-close')?.click();
    elementOf(fixture, '.log-detail-panel-center')?.click();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(centred).toHaveBeenCalledTimes(1);
  });

  it('opens the search from the find button, counts the matches whatever their case, and closes it from the same button', () => {
    const fixture = renderPanel();
    const find = elementOf(fixture, '.log-detail-panel-find');

    find?.click();
    fixture.detectChanges();
    typeInto(fixture, '.json-viewer-search-field input', 'ATLAS');
    vi.advanceTimersByTime(SEARCH_SETTLE_MILLISECONDS);
    fixture.detectChanges();

    expect(fixture.componentInstance.isSearchOpen()).toBe(true);
    expect(find?.getAttribute('aria-pressed')).toBe('true');
    expect(textOf(fixture, '.json-viewer-search-counter')).toBe('1 of 3');
    expect(countOf(fixture, '.json-viewer-hit')).toBe(3);

    find?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.isSearchOpen()).toBe(false);
    expect(countOf(fixture, '.json-viewer-hit')).toBe(0);
  });

  it('stepMatch moves through the matches and wraps around at either end', () => {
    const fixture = renderPanel();
    search(fixture, 'atlas');

    fixture.componentInstance.stepMatch(-1);
    fixture.detectChanges();

    expect(textOf(fixture, '.json-viewer-search-counter')).toBe('3 of 3');

    fixture.componentInstance.stepMatch(1);
    fixture.detectChanges();

    expect(textOf(fixture, '.json-viewer-search-counter')).toBe('1 of 3');
  });

  it('with a query that is nowhere, says there are no results', () => {
    const fixture = renderPanel();
    search(fixture, 'kafka');

    expect(textOf(fixture, '.json-viewer-search-counter')).toBe('No results');
    expect(elementOf(fixture, '.search-field-input-matches-nothing')).not.toBeNull();
  });

  it('for another entry, keeps the query and goes back to its first match', () => {
    const fixture = renderPanel();
    search(fixture, 'atlas');
    fixture.componentInstance.stepMatch(1);
    fixture.detectChanges();

    fixture.componentRef.setInput('entry', OTHER_ENTRY);
    fixture.detectChanges();

    expect((elementOf(fixture, '.json-viewer-search-field input') as HTMLInputElement).value).toBe('atlas');
    expect(textOf(fixture, '.json-viewer-search-counter')).toBe('1 of 2');
  });

  it('closeSearch clears the query and the highlights', () => {
    const fixture = renderPanel();
    search(fixture, 'atlas');

    fixture.componentInstance.closeSearch();
    fixture.detectChanges();
    fixture.componentInstance.openSearch();
    fixture.detectChanges();

    expect((elementOf(fixture, '.json-viewer-search-field input') as HTMLInputElement).value).toBe('');
    expect(countOf(fixture, '.json-viewer-hit')).toBe(0);
  });

  it('copies the whole object pretty-printed and says so for a moment', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const fixture = renderPanel();

    elementOf(fixture, '.log-detail-panel-copy')?.click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(RECORD, null, 2));
    expect(textOf(fixture, '.log-detail-panel-copy')).toBe('✓ Copied');

    await vi.advanceTimersByTimeAsync(1600);
    fixture.detectChanges();

    expect(textOf(fixture, '.log-detail-panel-copy')).toBe('Copy JSON');
  });

  it('says the copy was blocked when the browser refuses it', async () => {
    vi.stubGlobal('navigator', {});
    const fixture = renderPanel();

    elementOf(fixture, '.log-detail-panel-copy')?.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(TestBed.inject(ToastStore).message()).toBe('copy blocked by the browser');
  });

  it('names its shortcuts with the keys it is given, in the hint, on Find and on the previous-match button', () => {
    const fixture = renderPanel({ shortcutLabels: { find: '⌘F', previousMatch: '⇧Enter' } });
    fixture.componentInstance.openSearch();
    fixture.detectChanges();

    expect(textOf(fixture, '.log-detail-panel-footer')).toBe('⌘F find · Enter / ⇧Enter next, previous match · ← → step entries');
    expect(elementOf(fixture, '.log-detail-panel-find')?.title).toBe('find in JSON (⌘F)');
    expect(elementOf(fixture, '.json-viewer-search-step')?.title).toBe('previous match (⇧Enter)');
  });

  it('searches once the typing rests, not on every key, and shows what is typed in the field meanwhile', () => {
    const fixture = renderPanel();
    fixture.componentInstance.openSearch();
    fixture.detectChanges();

    typeInto(fixture, '.json-viewer-search-field input', 'emb');
    typeInto(fixture, '.json-viewer-search-field input', 'atlas');
    fixture.detectChanges();

    expect(countOf(fixture, '.json-viewer-hit')).toBe(0);
    expect(elementOf(fixture, '.json-viewer-search-field input')).toHaveProperty('value', 'atlas');

    vi.advanceTimersByTime(SEARCH_SETTLE_MILLISECONDS);
    fixture.detectChanges();

    expect(countOf(fixture, '.json-viewer-hit')).toBeGreaterThan(0);
  });

  it('LogDetailPanelComponent remembers the query committed in its search, and forgets it once asked to from the recent searches', async () => {
    const gateway = analyzerGatewayStub();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    const fixture = renderPanel();

    search(fixture, 'atlas');
    elementOf(fixture, '.json-viewer-search-field input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(gateway.rememberSearch).toHaveBeenCalledWith('log-detail', 'atlas'));

    typeInto(fixture, '.json-viewer-search-field input', '');
    fixture.detectChanges();
    elementOf(fixture, '.json-viewer-search-field input')?.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    elementOf(fixture, '.search-field-history-forget')?.click();

    await vi.waitFor(() => expect(gateway.forgetSearch).toHaveBeenCalledWith('log-detail', 'atlas'));
  });
});
