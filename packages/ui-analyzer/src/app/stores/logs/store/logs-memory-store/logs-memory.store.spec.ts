import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_MAPPING } from '../../models/log-mapping/log-mapping';
import type { LogsSnapshot } from '../../models/logs-snapshot/logs-snapshot';
import { LogsMemoryStore, REMEMBERED_ANALYSES } from './logs-memory.store';

const snapshotOf = (name: string): LogsSnapshot => ({
  file: { name, sizeBytes: 10 },
  loaded: { source: new File([], 'atlas-api-logs.json'), records: [], notes: [], fields: [], detectedMapping: EMPTY_MAPPING },
  draftMapping: EMPTY_MAPPING,
  placement: null,
  chosenColors: new Map(),
  hiddenTypes: new Set(),
  isShown: true,
});

describe('LogsMemoryStore', () => {
  let store: LogsMemoryStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(LogsMemoryStore);
  });

  it('snapshotOf, for an analysis whose logs were remembered, hands them back, and nothing for another', () => {
    const kept = snapshotOf('api.json');

    store.remember('a1', kept);

    expect(store.snapshotOf('a1')).toBe(kept);
    expect(store.snapshotOf('a2')).toBeNull();
  });

  it('forget, for a remembered analysis, drops its logs', () => {
    store.remember('a1', snapshotOf('api.json'));

    store.forget('a1');

    expect(store.snapshotOf('a1')).toBeNull();
  });

  it('remember, past the analyses it keeps, drops the one remembered longest ago', () => {
    const analysisIds = Array.from({ length: REMEMBERED_ANALYSES + 1 }, (_unused, index) => `a${index}`);

    analysisIds.forEach((analysisId) => {
      store.remember(analysisId, snapshotOf(`${analysisId}.json`));
    });

    expect(store.snapshotOf('a0')).toBeNull();
    expect(store.snapshotOf(`a${REMEMBERED_ANALYSES}`)?.file.name).toBe(`a${REMEMBERED_ANALYSES}.json`);
  });
});
