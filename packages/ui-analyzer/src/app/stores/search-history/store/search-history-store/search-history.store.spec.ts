import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { SEARCH_FIELDS } from '../../models/search-field/search-field';
import { SearchHistoryStore } from './search-history.store';

describe('SearchHistoryStore', () => {
  let store: SearchHistoryStore;
  let gateway: AnalyzerGateway;

  beforeEach(() => {
    gateway = analyzerGatewayStub({ fetchSearchHistory: vi.fn().mockResolvedValue(['memory', 'cpu']) });
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    store = TestBed.inject(SearchHistoryStore);
  });

  it('load reads a field once and keeps it apart from the other fields', async () => {
    await store.load(SEARCH_FIELDS.CHART_LIBRARY);
    await store.load(SEARCH_FIELDS.CHART_LIBRARY);

    expect(store.histories()[SEARCH_FIELDS.CHART_LIBRARY]).toEqual(['memory', 'cpu']);
    expect(store.histories()[SEARCH_FIELDS.LIBRARY]).toEqual([]);
    expect(gateway.fetchSearchHistory).toHaveBeenCalledTimes(1);
  });

  it('load answers false when the history cannot be read, and reads it again the next time', async () => {
    vi.mocked(gateway.fetchSearchHistory).mockRejectedValueOnce(new Error('daemon away'));

    expect(await store.load(SEARCH_FIELDS.LIBRARY)).toBe(false);
    expect(await store.load(SEARCH_FIELDS.LIBRARY)).toBe(true);
    expect(gateway.fetchSearchHistory).toHaveBeenCalledTimes(2);
  });

  it('remember keeps the history the daemon answers with', async () => {
    vi.mocked(gateway.rememberSearch).mockResolvedValue(['disk', 'memory']);

    expect(await store.remember(SEARCH_FIELDS.LIBRARY, ' disk ')).toBe(true);

    expect(gateway.rememberSearch).toHaveBeenCalledWith(SEARCH_FIELDS.LIBRARY, 'disk');
    expect(store.histories()[SEARCH_FIELDS.LIBRARY]).toEqual(['disk', 'memory']);
  });

  it('remember writes nothing for a blank term or for the term already at the head of the history', async () => {
    await store.load(SEARCH_FIELDS.CHART_LIBRARY);

    await store.remember(SEARCH_FIELDS.CHART_LIBRARY, '   ');
    await store.remember(SEARCH_FIELDS.CHART_LIBRARY, 'MEMORY');

    expect(gateway.rememberSearch).not.toHaveBeenCalled();
  });

  it('remember answers false and keeps the history it had when the write fails', async () => {
    await store.load(SEARCH_FIELDS.CHART_LIBRARY);
    vi.mocked(gateway.rememberSearch).mockRejectedValue(new Error('daemon away'));

    expect(await store.remember(SEARCH_FIELDS.CHART_LIBRARY, 'disk')).toBe(false);
    expect(store.histories()[SEARCH_FIELDS.CHART_LIBRARY]).toEqual(['memory', 'cpu']);
  });

  it('keeps the answer of the latest write when an earlier one arrives after it', async () => {
    const answers: { resolveFirst: (history: readonly string[]) => void } = { resolveFirst: () => undefined };
    vi.mocked(gateway.rememberSearch)
      .mockImplementationOnce(() => new Promise((resolve) => (answers.resolveFirst = resolve)))
      .mockResolvedValueOnce(['second', 'first']);

    const first = store.remember(SEARCH_FIELDS.LIBRARY, 'first');
    await store.remember(SEARCH_FIELDS.LIBRARY, 'second');
    answers.resolveFirst(['first']);
    await first;

    expect(store.histories()[SEARCH_FIELDS.LIBRARY]).toEqual(['second', 'first']);
  });

  it('load keeps the history a write answered with when the write lands while the history is still being read', async () => {
    const answers: { resolveLoad: (history: readonly string[]) => void } = { resolveLoad: () => undefined };
    vi.mocked(gateway.fetchSearchHistory).mockImplementationOnce(() => new Promise((resolve) => (answers.resolveLoad = resolve)));
    vi.mocked(gateway.rememberSearch).mockResolvedValueOnce(['disk', 'memory']);

    const loading = store.load(SEARCH_FIELDS.LIBRARY);
    await store.remember(SEARCH_FIELDS.LIBRARY, 'disk');
    answers.resolveLoad(['memory']);
    const isLoaded = await loading;

    expect(isLoaded).toBe(true);
    expect(store.histories()[SEARCH_FIELDS.LIBRARY]).toEqual(['disk', 'memory']);
  });

  it('forget keeps what the field still holds', async () => {
    await store.load(SEARCH_FIELDS.CHART_LIBRARY);
    vi.mocked(gateway.forgetSearch).mockResolvedValue(['cpu']);

    expect(await store.forget(SEARCH_FIELDS.CHART_LIBRARY, 'memory')).toBe(true);

    expect(gateway.forgetSearch).toHaveBeenCalledWith(SEARCH_FIELDS.CHART_LIBRARY, 'memory');
    expect(store.histories()[SEARCH_FIELDS.CHART_LIBRARY]).toEqual(['cpu']);
  });
});
